import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useNavigate, useNavigation } from "react-router";
import { toast } from "sonner";
import {
	InventoryAddRow,
	InventoryFilters,
	InventoryInfoReelCards,
	InventoryProvider,
	PAGE_SIZE,
	QuantitySelectionModal,
	RemoveInventoryModal,
	TransactionSelectorModal,
	useInventory,
	useInventoryColumns,
} from "~/components/inventory";
import {
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { DataTable } from "~/components/ui/data-table";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Textarea } from "~/components/ui/textarea";
import { useLanguage } from "~/contexts/language-context";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import { useUser } from "~/contexts/user-context";
import {
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type Transaction,
} from "~/db";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/inventory";

// ============================================================================
// Meta
// ============================================================================

export function meta({ data }: Route.MetaArgs) {
	const filters = [];
	if (data?.filters?.name) filters.push(data.filters.name);
	if (data?.filters?.location) filters.push(data.filters.location);
	if (data?.filters?.category) filters.push(data.filters.category);

	const filterText = filters.length > 0 ? ` - ${filters.join(", ")}` : "";

	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Tavaraluettelo${filterText} / Inventory`,
		},
		{
			name: "description",
			content: "Toimikunnan tavaraluettelo / Tenant Committee Inventory",
		},
	];
}

// ============================================================================
// Loader
// ============================================================================

export async function loader({ request }: Route.LoaderArgs) {
	// Check permission (works for both logged-in users and guests)
	const authUser = await getAuthenticatedUser(request, getDatabase);

	let permissions: string[];
	let languages: { primary: string; secondary: string };

	if (authUser) {
		permissions = authUser.permissions;
		languages = {
			primary: authUser.primaryLanguage,
			secondary: authUser.secondaryLanguage,
		};
	} else {
		const guestContext = await getGuestContext(() => getDatabase());
		permissions = guestContext.permissions;
		languages = guestContext.languages;
	}

	const canRead = permissions.some((p) => p === "inventory:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const url = new URL(request.url);
	const nameFilter = url.searchParams.get("name") || "";
	const locationFilter = url.searchParams.get("location") || "";
	const categoryFilter = url.searchParams.get("category") || "";
	const page = parseInt(url.searchParams.get("page") || "1", 10);
	const isInfoReel = url.searchParams.get("view") === "infoReel";

	const allItems = await db.getInventoryItems();
	const uniqueLocations = [
		...new Set(allItems.map((item) => item.location).filter(Boolean)),
	].sort();
	const uniqueCategories = [
		...new Set(
			allItems.map((item) => item.category).filter(Boolean) as string[],
		),
	].sort();

	if (isInfoReel) {
		const reelItems = allItems.filter(
			(item) => item.showInInfoReel && item.status === "active",
		);
		const shuffled = reelItems.sort(() => Math.random() - 0.5);
		const items = shuffled.slice(0, 3);

		return {
			siteConfig: SITE_CONFIG,
			items,
			filters: {
				name: nameFilter,
				location: locationFilter,
				category: categoryFilter,
			},
			isInfoReel: true,
			totalCount: items.length,
			currentPage: 1,
			pageSize: PAGE_SIZE,
			uniqueLocations,
			uniqueCategories,
			transactionLinksMap: {} as Record<
				string,
				{
					transaction: {
						id: string;
						description: string;
						date: Date;
						type: string;
					};
					quantity: number;
				}[]
			>,
			languages,
		};
	}

	let items = [...allItems];
	if (nameFilter) {
		const searchTerm = nameFilter.toLowerCase();
		items = items.filter((item) =>
			item.name.toLowerCase().includes(searchTerm),
		);
	}
	if (locationFilter) {
		const searchTerm = locationFilter.toLowerCase();
		items = items.filter((item) => item.location.toLowerCase() === searchTerm);
	}
	if (categoryFilter) {
		const searchTerm = categoryFilter.toLowerCase();
		items = items.filter(
			(item) => (item.category || "").toLowerCase() === searchTerm,
		);
	}

	items = items.sort((a, b) => a.name.localeCompare(b.name, "fi"));
	const totalCount = items.length;
	const startIndex = (page - 1) * PAGE_SIZE;
	const paginatedItems = items.slice(startIndex, startIndex + PAGE_SIZE);

	// Fetch transaction links for each item (for remove modal)
	const transactionLinksMap: Record<
		string,
		{
			transaction: {
				id: string;
				description: string;
				date: Date;
				type: string;
			};
			quantity: number;
		}[]
	> = {};
	for (const item of paginatedItems) {
		const links = await db.getTransactionLinksForItem(item.id);
		transactionLinksMap[item.id] = links.map((l) => ({
			transaction: {
				id: l.transaction.id,
				description: l.transaction.description,
				date: l.transaction.date,
				type: l.transaction.type,
			},
			quantity: l.quantity,
		}));
	}

	// Fetch inventory-category transactions for "Add to Existing" feature
	const allTransactions = await db.getAllTransactions();
	const inventoryTransactions = allTransactions
		.filter(
			(t: { category: string | null; status: string }) =>
				t.category === "inventory" && t.status !== "cancelled",
		)
		.map(
			(t: {
				id: string;
				description: string;
				date: Date;
				amount: string;
				category: string | null;
			}) => ({
				id: t.id,
				description: t.description,
				date: t.date,
				amount: t.amount,
				category: t.category,
			}),
		)
		.sort(
			(a: { date: Date }, b: { date: Date }) =>
				new Date(b.date).getTime() - new Date(a.date).getTime(),
		)
		.slice(0, 50); // Limit to recent 50

	return {
		siteConfig: SITE_CONFIG,
		items: paginatedItems,
		filters: {
			name: nameFilter,
			location: locationFilter,
			category: categoryFilter,
		},
		isInfoReel: false,
		totalCount,
		currentPage: page,
		pageSize: PAGE_SIZE,
		uniqueLocations,
		uniqueCategories,
		transactionLinksMap,
		inventoryTransactions,
		languages,
	};
}

// ============================================================================
// Action
// ============================================================================

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action");
	const itemId = formData.get("itemId") as string;
	const itemIds = formData.get("itemIds") as string;

	if (actionType === "delete" && itemId) {
		const purchases = await db.getPurchasesByInventoryItem(itemId);
		for (const purchase of purchases) {
			await db.deletePurchase(purchase.id);
		}
		await db.deleteInventoryItem(itemId);
	}

	if (actionType === "deleteMany" && itemIds) {
		const ids = JSON.parse(itemIds) as string[];
		for (const id of ids) {
			const purchases = await db.getPurchasesByInventoryItem(id);
			for (const purchase of purchases) {
				await db.deletePurchase(purchase.id);
			}
			await db.deleteInventoryItem(id);
		}
	}

	if (actionType === "toggleInfoReel" && itemId) {
		const item = await db.getInventoryItemById(itemId);
		if (item) {
			await db.updateInventoryItem(itemId, {
				showInInfoReel: !item.showInInfoReel,
			});
		}
	}

	if (actionType === "updateField" && itemId) {
		const field = formData.get("field") as string;
		const value = formData.get("value") as string;
		if (
			field &&
			[
				"name",
				"category",
				"description",
				"location",
				"quantity",
				"value",
			].includes(field)
		) {
			if (field === "quantity") {
				await db.updateInventoryItem(itemId, {
					quantity: parseInt(value, 10) || 1,
				});
			} else if (field === "value") {
				await db.updateInventoryItem(itemId, { value: value || "0" });
			} else {
				await db.updateInventoryItem(itemId, { [field]: value || null });
			}
		}
	}

	if (actionType === "createItem") {
		const newItem: NewInventoryItem = {
			name: formData.get("name") as string,
			quantity: parseInt(formData.get("quantity") as string, 10) || 1,
			location: formData.get("location") as string,
			category: (formData.get("category") as string) || null,
			description: (formData.get("description") as string) || null,
			value: (formData.get("value") as string) || "0",
		};
		await db.createInventoryItem(newItem);
	}

	if (actionType === "report") {
		const reportItemIds = formData.get("reportItemIds") as string;
		const reportMessage = formData.get("reportMessage") as string;
		const ids = JSON.parse(reportItemIds) as string[];

		const itemNames: string[] = [];
		for (const id of ids) {
			const item = await db.getInventoryItemById(id);
			if (item) itemNames.push(item.name);
		}

		await db.createSubmission({
			type: "questions",
			name: "Tavaraluettelo / Inventory Report",
			email: "inventory@report",
			message: `Ilmoitus tavaroista / Report for items:\n${itemNames.join(", ")}\n\nViesti / Message:\n${reportMessage}`,
		});
	}

	// Remove item with transaction-aware quantity reduction
	if (actionType === "removeItem" && itemId) {
		const reason = formData.get("reason") as string;
		const notes = formData.get("notes") as string;
		const removals = JSON.parse(
			(formData.get("removals") as string) || "[]",
		) as { transactionId: string; quantity: number }[];
		const totalToRemove =
			parseInt(formData.get("totalToRemove") as string, 10) || 0;

		// Process each removal from linked transactions
		for (const removal of removals) {
			await db.reduceInventoryFromTransaction(
				itemId,
				removal.transactionId,
				removal.quantity,
			);
		}

		// If no transaction links or removing all, just update the item
		const item = await db.getInventoryItemById(itemId);
		if (item) {
			const newQty =
				removals.length > 0
					? item.quantity
					: Math.max(0, item.quantity - totalToRemove);
			if (newQty <= 0) {
				// Soft delete if quantity reaches zero
				await db.softDeleteInventoryItem(itemId, reason, notes);
			} else if (removals.length === 0 && totalToRemove > 0) {
				// Direct quantity reduction (no transaction links)
				await db.updateInventoryItem(itemId, { quantity: newQty });
			}
		}
	}

	// Mark item manual count (no transaction)
	if (actionType === "markManualCount" && itemId) {
		const item = await db.getInventoryItemById(itemId);
		if (item) {
			const quantityToAdd =
				parseInt(formData.get("quantityToAdd") as string, 10) || 0;
			const newManualCount = (item.manualCount || 0) + quantityToAdd;
			// Ensure we don't exceed total quantity (logic check)
			// We trust the client/dialog roughly, but could enforce strict check here
			await db.updateInventoryItemManualCount(itemId, newManualCount);
		}
	}

	// Reduce manual count (reverse of markManualCount - return units to unknown)
	if (actionType === "reduceManualCount") {
		const itemId = formData.get("itemId") as string;
		const quantityToRemove = parseInt(
			formData.get("quantityToRemove") as string,
			10,
		);

		if (itemId && quantityToRemove > 0) {
			const item = await db.getInventoryItemById(itemId);
			if (item) {
				const newManualCount = Math.max(
					0,
					(item.manualCount || 0) - quantityToRemove,
				);
				await db.updateInventoryItemManualCount(itemId, newManualCount);
			}
		}
	}

	// Unlink item from transaction with amount update
	if (actionType === "unlinkFromTransaction") {
		const itemId = formData.get("itemId") as string;
		const transactionId = formData.get("transactionId") as string;

		if (itemId && transactionId) {
			// Fetch validation data to calculate amount reduction
			const item = await db.getInventoryItemById(itemId);
			const links = await db.getTransactionLinksForItem(itemId);
			const link = links.find((l) => l.transaction.id === transactionId);

			if (item && link) {
				// Calculate unit value and deduction
				// item.value stores the UNIT VALUE (per item)
				const unitValue = parseFloat(item.value || "0");
				const deduction = link.quantity * unitValue;

				if (deduction > 0) {
					const currentAmount = parseFloat(link.transaction.amount);
					const newAmount = Math.max(0, currentAmount - deduction).toFixed(2);

					console.log(
						`[Unlink] Reducing transaction ${transactionId} amount from ${currentAmount} to ${newAmount} (Deduction: ${deduction})`,
					);

					await db.updateTransaction(transactionId, { amount: newAmount });
				}
			}

			await db.unlinkInventoryItemFromTransaction(itemId, transactionId);
		}
	}

	// Migrate legacy items to use manualCount (one-time operation)
	if (actionType === "migrateLegacy") {
		const allItems = await db.getInventoryItems();
		const legacyItems = allItems.filter((item) => item.status === "legacy");

		for (const item of legacyItems) {
			// Set manualCount = quantity and status = active
			await db.updateInventoryItem(item.id, { status: "active" });
			await db.updateInventoryItemManualCount(item.id, item.quantity);
		}

		return { success: true, migratedCount: legacyItems.length };
	}

	return { success: true };
}

// ============================================================================
// Component
// ============================================================================

export default function Inventory({ loaderData }: Route.ComponentProps) {
	const {
		items,
		filters,
		isInfoReel,
		totalCount,
		currentPage,
		pageSize,
		uniqueLocations,
		uniqueCategories,
		transactionLinksMap,
		inventoryTransactions,
		languages,
	} = loaderData;
	const { hasPermission } = useUser();
	const canWrite = hasPermission("inventory:write");
	const canDelete = hasPermission("inventory:delete");

	return (
		<InventoryProvider
			items={items}
			filters={filters}
			uniqueLocations={uniqueLocations}
			uniqueCategories={uniqueCategories}
			totalCount={totalCount}
			currentPage={currentPage}
			pageSize={pageSize}
			isStaff={canWrite}
			isAdmin={canDelete}
			transactionLinksMap={transactionLinksMap}
			inventoryTransactions={inventoryTransactions || []}
		>
			{isInfoReel ? (
				<InventoryInfoReelPage languages={languages} />
			) : (
				<InventoryTablePage languages={languages} />
			)}
		</InventoryProvider>
	);
}

// ============================================================================
// Info Reel Page
// ============================================================================

function InventoryInfoReelPage({
	languages,
}: {
	languages: { primary: string; secondary: string };
}) {
	const { items } = useInventory();
	const { t } = useTranslation();

	return (
		<PageWrapper>
			<SplitLayout
				right={<InventoryQRPanel languages={languages} />}
				footer={<InventoryFooter />}
				header={{
					primary: t("inventory.title", { lng: languages.primary }),
					secondary: t("inventory.title", { lng: languages.secondary }),
				}}
			>
				<ContentArea>
					<InventoryInfoReelCards items={items} />
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}

// ============================================================================
// Table Page
// ============================================================================

function InventoryTablePage({
	languages,
}: {
	languages: { primary: string; secondary: string };
}) {
	const {
		items,
		totalCount,
		currentPage,
		pageSize,
		isStaff,
		showAddRow,
		setShowAddRow,
		selectedIds,
		setSelectedIds,
		visibleColumns,
		handleInlineEdit,
		handlePageChange,
		uniqueLocations,
		uniqueCategories,
		transactionLinksMap,
		inventoryTransactions,
	} = useInventory();

	const navigation = useNavigation();
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const { setItems: setTransactionItems } = useNewTransaction();
	const isLoading = navigation.state === "loading";
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Modal state
	const [showReportModal, setShowReportModal] = useState(false);
	const [reportMessage, setReportMessage] = useState("");
	const [removeModalItem, setRemoveModalItem] = useState<InventoryItem | null>(
		null,
	);
	const [showQuantityModal, setShowQuantityModal] = useState(false);
	const [quantityModalMode, setQuantityModalMode] = useState<
		"markNoTransaction" | "addTransaction" | "addToExisting"
	>("markNoTransaction");

	// State for transaction selector (Add to Existing flow)
	const [showTransactionSelector, setShowTransactionSelector] = useState(false);
	const [pendingItemSelections, setPendingItemSelections] = useState<
		{ itemId: string; quantity: number }[]
	>([]);

	// State for unlink confirmation dialog
	const [unlinkConfirmation, setUnlinkConfirmation] = useState<{
		itemId: string;
		transactionId: string;
		quantity: number;
	} | null>(null);

	const { isInfoReel } = useLanguage();
	const { t } = useTranslation();

	const getUnknownQuantity = (item: InventoryItem) => {
		const links = transactionLinksMap[item.id] || [];
		const linkedQty = links.reduce((sum, l) => sum + l.quantity, 0);
		const manualQty = item.manualCount || 0;
		return Math.max(0, item.quantity - linkedQty - manualQty);
	};

	// Get selected items and their unknown quantities
	const selectedItems = items.filter((i) => selectedIds.includes(i.id));
	const selectedItemNames = selectedItems.map((i) => i.name);
	const itemsWithUnknown = selectedItems
		.map((item) => ({ item, unknownQuantity: getUnknownQuantity(item) }))
		.filter(({ unknownQuantity }) => unknownQuantity > 0);

	// Check capabilities
	const canRemoveSelection = selectedItems.some((i) => i.status === "active");
	const hasTreasuryCapableItems = itemsWithUnknown.length > 0;

	const handleSubmitReport = () => {
		if (selectedIds.length === 0 || !reportMessage.trim()) return;
		fetcher.submit(
			{
				_action: "report",
				reportItemIds: JSON.stringify(selectedIds),
				reportMessage: reportMessage,
			},
			{ method: "POST" },
		);
		setShowReportModal(false);
		setReportMessage("");
		setSelectedIds([]);
	};

	const getTransactionLinksForItem = (item: InventoryItem) => {
		const links = transactionLinksMap[item.id] || [];
		return links.map((l) => ({
			transaction: l.transaction as Transaction,
			quantity: l.quantity,
		}));
	};

	const handleRemoveSelected = () => {
		const firstActiveItem = selectedItems.find((i) => i.status === "active");
		if (firstActiveItem) {
			setRemoveModalItem(firstActiveItem);
		}
	};

	const handleOpenQuantityModal = (
		mode: "markNoTransaction" | "addTransaction" | "addToExisting",
	) => {
		setQuantityModalMode(mode);
		setShowQuantityModal(true);
	};

	const handleQuantityConfirm = (
		selections: { itemId: string; quantity: number }[],
	) => {
		if (quantityModalMode === "markNoTransaction") {
			// Submit each selection as a markManualCount action
			for (const sel of selections) {
				fetcher.submit(
					{
						_action: "markManualCount",
						itemId: sel.itemId,
						quantityToAdd: sel.quantity.toString(),
					},
					{ method: "POST" },
				);
			}
			setSelectedIds([]);
		} else if (quantityModalMode === "addToExisting") {
			// Store selections and show transaction selector
			setPendingItemSelections(selections);
			setShowTransactionSelector(true);
		} else {
			// Set items in context and navigate to new transaction
			const transactionItems = selections.map((sel) => {
				const item = items.find((i) => i.id === sel.itemId);
				return {
					itemId: sel.itemId,
					name: item?.name || "Unknown",
					quantity: sel.quantity,
					unitValue: parseFloat(item?.value || "0"),
				};
			});
			setTransactionItems(transactionItems);
			navigate("/treasury/new");
		}
	};

	const handleSelectTransaction = (transaction: {
		id: string;
		description: string;
		date: Date;
		amount: string;
		category: string | null;
	}) => {
		// Set items in context for the edit page
		const transactionItems = pendingItemSelections.map((sel) => {
			const item = items.find((i) => i.id === sel.itemId);
			return {
				itemId: sel.itemId,
				name: item?.name || "Unknown",
				quantity: sel.quantity,
				unitValue: parseFloat(item?.value || "0"),
			};
		});
		setTransactionItems(transactionItems);
		setShowTransactionSelector(false);
		setPendingItemSelections([]);
		setSelectedIds([]);
		// Navigate to the edit page
		navigate(`/treasury/breakdown/${transaction.id}/edit?addItems=true`);
	};

	// Handlers for unlink operations
	const handleUnlinkFromTransaction = (
		itemId: string,
		transactionId: string,
		quantity: number,
	) => {
		// Show confirmation dialog
		setUnlinkConfirmation({ itemId, transactionId, quantity });
	};

	const handleConfirmUnlink = () => {
		if (unlinkConfirmation) {
			fetcher.submit(
				{
					_action: "unlinkFromTransaction",
					itemId: unlinkConfirmation.itemId,
					transactionId: unlinkConfirmation.transactionId,
				},
				{ method: "POST" },
			);
			setUnlinkConfirmation(null);
		}
	};

	const handleReduceManualCount = (itemId: string, quantity: number) => {
		// No confirmation needed - directly remove marker
		fetcher.submit(
			{
				_action: "reduceManualCount",
				itemId,
				quantityToRemove: quantity.toString(),
			},
			{ method: "POST" },
		);
	};

	const columns = useInventoryColumns({
		visibleColumns,
		isStaff,
		onInlineEdit: handleInlineEdit,
		onUnlinkFromTransaction: handleUnlinkFromTransaction,
		onReduceManualCount: handleReduceManualCount,
		uniqueLocations,
		uniqueCategories,
		itemNames: items.map((i) => i.name),
		transactionLinksMap,
	});

	const addRowElement = isStaff && showAddRow ? <InventoryAddRow /> : null;

	// Actions bar (Right side) - responsive: dropdown on mobile, inline on desktop
	const actionsComponent = isStaff ? (
		<>
			{/* Mobile: Dropdown menu for actions */}
			<div className="md:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="default"
							size="sm"
							className="group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-300"
						>
							<span className="material-symbols-outlined text-base">
								more_vert
							</span>
							{t("inventory.actions.menu")}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuItem onClick={() => setShowAddRow(!showAddRow)}>
							<span className="material-symbols-outlined text-base mr-2">
								{showAddRow ? "close" : "add"}
							</span>
							<div>
								<p className="font-medium">
									{showAddRow
										? t("inventory.actions.close")
										: t("inventory.actions.add")}
								</p>
								{isInfoReel && (
									<p className="text-xs text-muted-foreground">
										{showAddRow ? "Close add row" : "Add item"}
									</p>
								)}
							</div>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<a
								href="/api/inventory/export"
								download
								className="flex items-center cursor-pointer"
							>
								<span className="material-symbols-outlined text-base mr-2">
									download
								</span>
								<div>
									<p className="font-medium">
										{t("inventory.actions.export_short")}
									</p>
									{isInfoReel && (
										<p className="text-xs text-muted-foreground">Export CSV</p>
									)}
								</div>
							</a>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => fileInputRef.current?.click()}
							disabled={fetcher.state !== "idle"}
						>
							<span className="material-symbols-outlined text-base mr-2">
								upload
							</span>
							<div>
								<p className="font-medium">
									{t("inventory.actions.import_short")}
								</p>
								<p className="text-xs text-muted-foreground">Import CSV</p>
							</div>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Desktop: Inline buttons */}
			<div className="hidden md:flex gap-2 flex-wrap items-center">
				<Button
					variant="default"
					size="sm"
					onClick={() => setShowAddRow(!showAddRow)}
					className="flex items-center gap-1"
				>
					<span className="material-symbols-outlined text-base">
						{showAddRow ? "close" : "add"}
					</span>
					{showAddRow
						? t("inventory.actions.close")
						: t("inventory.actions.add")}
				</Button>

				<Button variant="ghost" size="sm" asChild>
					<a
						href="/api/inventory/export"
						download
						className="flex items-center gap-1"
					>
						<span className="material-symbols-outlined text-base">
							download
						</span>
						{t("inventory.actions.export")}
					</a>
				</Button>

				<Button
					variant="ghost"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					className="flex items-center gap-1"
					disabled={fetcher.state !== "idle"}
				>
					<span className="material-symbols-outlined text-base">upload</span>
					{t("inventory.actions.import")}
				</Button>
			</div>

			{/* Hidden file input - shared between mobile and desktop */}
			<input
				type="file"
				ref={fileInputRef}
				className="hidden"
				accept=".csv, .xlsx, .xls"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) {
						const formData = new FormData();
						formData.set("file", file);
						fetcher.submit(formData, {
							method: "POST",
							action: "/api/inventory/import",
							encType: "multipart/form-data",
						});
						e.target.value = "";
						toast.info(t("inventory.messages.importing"));
					}
				}}
			/>
		</>
	) : null;

	// Selection Actions (Left side)
	const selectionActions =
		selectedIds.length > 0 ? (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm">
						<span className="material-symbols-outlined text-base mr-1">
							checklist
						</span>
						{t("inventory.actions.selected")} ({selectedIds.length})
						<span className="material-symbols-outlined text-base ml-1">
							expand_more
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={() => setShowReportModal(true)}>
						<span className="material-symbols-outlined text-base mr-2">
							report
						</span>
						{t("inventory.actions.report")}
					</DropdownMenuItem>
					{isStaff && (
						<>
							<DropdownMenuSeparator />
							{/* Treasury Section - flattened for mobile compatibility */}
							<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
								{t("inventory.actions.treasury")}
							</div>
							<DropdownMenuItem
								onClick={() => handleOpenQuantityModal("addTransaction")}
								disabled={!hasTreasuryCapableItems}
							>
								<span className="material-symbols-outlined text-base mr-2">
									add_circle
								</span>
								{t("inventory.actions.add_to_new")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleOpenQuantityModal("addToExisting")}
								disabled={
									!hasTreasuryCapableItems || inventoryTransactions.length === 0
								}
							>
								<span className="material-symbols-outlined text-base mr-2">
									playlist_add
								</span>
								{t("inventory.actions.add_to_existing")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleOpenQuantityModal("markNoTransaction")}
								disabled={!hasTreasuryCapableItems}
							>
								<span className="material-symbols-outlined text-base mr-2">
									block
								</span>
								{t("inventory.actions.no_transaction")}
							</DropdownMenuItem>

							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={handleRemoveSelected}
								disabled={!canRemoveSelection}
								className="text-red-600"
							>
								<span className="material-symbols-outlined text-base mr-2">
									delete
								</span>
								{t("inventory.actions.remove")}
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		) : null;

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("inventory.title", { lng: languages.primary }),
					secondary: t("inventory.title", { lng: languages.secondary }),
				}}
			>
				<div
					className={`space-y-4 transition-opacity duration-200 ${isLoading ? "opacity-50" : ""}`}
				>
					<InventoryFilters />

					<DataTable
						columns={columns}
						data={items}
						getRowId={(row) => row.id}
						totalCount={totalCount}
						currentPage={currentPage}
						pageSize={pageSize}
						onPageChange={handlePageChange}
						enableRowSelection={true}
						onSelectionChange={setSelectedIds}
						prependedRow={addRowElement}
						actionsComponent={actionsComponent}
						selectionActions={selectionActions}
						maxBodyHeight="calc(100vh - 280px)"
					/>
				</div>
			</SplitLayout>

			{/* Report Modal */}
			{/* Report Modal */}
			<Dialog open={showReportModal} onOpenChange={setShowReportModal}>
				<DialogContent className="w-full h-full max-w-none md:h-auto md:max-w-lg p-0 md:p-6 rounded-none md:rounded-lg overflow-y-auto flex flex-col md:block">
					<div className="p-4 md:p-0 flex-1 overflow-y-auto">
						<DialogHeader className="mb-4 text-left">
							<DialogTitle>{t("inventory.modals.report_title")}</DialogTitle>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<p className="text-sm text-gray-500 mb-2">
									{t("inventory.modals.selected_items")}
								</p>
								<p className="font-medium">{selectedItemNames.join(", ")}</p>
							</div>
							<Textarea
								value={reportMessage}
								onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
									setReportMessage(e.target.value)
								}
								placeholder={t("inventory.modals.describe_issue")}
								rows={4}
							/>
						</div>
					</div>
					<div className="p-4 md:p-0 border-t md:border-t-0 mt-auto">
						<DialogFooter className="flex flex-col sm:flex-row gap-2">
							<Button
								variant="outline"
								onClick={() => setShowReportModal(false)}
								className="flex-1 sm:flex-none"
							>
								{t("inventory.modals.cancel")}
							</Button>
							<Button
								onClick={handleSubmitReport}
								disabled={!reportMessage.trim()}
								className="flex-1 sm:flex-none"
							>
								{t("inventory.modals.send")}
							</Button>
						</DialogFooter>
					</div>
				</DialogContent>
			</Dialog>

			{/* Remove Inventory Modal */}
			{removeModalItem && (
				<RemoveInventoryModal
					item={removeModalItem}
					transactionLinks={getTransactionLinksForItem(removeModalItem)}
					isOpen={!!removeModalItem}
					onClose={() => setRemoveModalItem(null)}
				/>
			)}

			{/* Quantity Selection Modal */}
			<QuantitySelectionModal
				open={showQuantityModal}
				onOpenChange={setShowQuantityModal}
				items={itemsWithUnknown}
				mode={quantityModalMode}
				onConfirm={handleQuantityConfirm}
			/>

			{/* Unlink Confirmation Dialog */}
			<Dialog
				open={!!unlinkConfirmation}
				onOpenChange={(open) => !open && setUnlinkConfirmation(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{t("inventory.modals.confirm_unlink_title")}
						</DialogTitle>
					</DialogHeader>
					<div className="py-4">
						<p className="text-gray-600 dark:text-gray-400">
							{t("inventory.modals.confirm_unlink_desc")}
						</p>
						<p className="text-gray-600 dark:text-gray-400 mt-2">
							{/* Note: This is now handled by the bilingual t() helper replacement which we can't easily do for mixed text content without changing structure.
                                Actually, the original was:
                                <p>Haluatko... {quantity} kpl...</p>
                                <p>Are you... {quantity} unit(s)...</p>
                                I can utilize t with interpolation.
                             */}
							{t("inventory.modals.confirm_unlink_details", {
								count: unlinkConfirmation?.quantity,
							})}
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setUnlinkConfirmation(null)}
						>
							{t("inventory.modals.cancel")}
						</Button>
						<Button variant="destructive" onClick={handleConfirmUnlink}>
							{t("inventory.modals.unlink")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Transaction Selector Modal */}
			<TransactionSelectorModal
				open={showTransactionSelector}
				onOpenChange={setShowTransactionSelector}
				transactions={inventoryTransactions}
				onSelect={handleSelectTransaction}
			/>
		</PageWrapper>
	);
}

// ============================================================================
// Shared Components
// ============================================================================

function InventoryQRPanel({
	languages,
}: {
	languages: { primary: string; secondary: string };
}) {
	const { t } = useTranslation();
	return (
		<QRPanel
			qrUrl="/inventory"
			title={
				<h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
					{t("inventory.title", { lng: languages.primary })} <br />
					<span className="text-lg text-gray-400 font-bold">
						{t("inventory.title", { lng: languages.secondary })}
					</span>
				</h2>
			}
		/>
	);
}

function InventoryFooter() {
	const { isAdmin } = useInventory();

	return (
		<div className="flex items-center gap-2">
			{isAdmin && (
				<>
					<a
						href="/api/inventory/export"
						className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
						title="Export CSV"
					>
						<span className="material-symbols-outlined text-xl">download</span>
					</a>
					<label
						className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
						title="Import"
					>
						<input
							type="file"
							accept=".csv,.xlsx,.xls"
							className="hidden"
							onChange={async (e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								const formData = new FormData();
								formData.append("file", file);
								const res = await fetch("/api/inventory/import", {
									method: "POST",
									body: formData,
								});
								const data = await res.json();
								alert(
									data.success
										? `Imported ${data.imported} items`
										: `Error: ${data.error}`,
								);
								if (data.success) window.location.reload();
								e.target.value = "";
							}}
						/>
						<span className="material-symbols-outlined text-xl">upload</span>
					</label>
				</>
			)}
		</div>
	);
}
