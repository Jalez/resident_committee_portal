import { useTranslation } from "react-i18next";
import { useNavigation, useRouteLoaderData } from "react-router";
import { AddItemButton } from "~/components/add-item-button";
import type { loader as rootLoader } from "~/root";
import {
	InventoryInfoReelCards,
	InventoryProvider,
	PAGE_SIZE,
	useInventory,
	useInventoryColumns,
} from "~/components/inventory";
import {
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { DataTable } from "~/components/ui/data-table";

import { useUser } from "~/contexts/user-context";
import {
	getDatabase,
	type NewInventoryItem,
} from "~/db/server.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import type { Route } from "./+types/_index";

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
	let items = [...allItems];
	const canWrite = permissions.some(
		(p) => p === "inventory:write" || p === "*",
	);

	// Filter drafts for non-staff
	if (!canWrite) {
		items = items.filter((item) => item.status !== "draft");
	}

	const uniqueLocations = [
		...new Set(items.map((item) => item.location ?? "missing location")),
	].sort();
	const uniqueCategories = [
		...new Set(items.map((item) => item.category).filter(Boolean) as string[]),
	].sort();

	if (isInfoReel) {
		const reelItems = items.filter(
			(item) => item.showInInfoReel && item.status === "active",
		);
		const shuffled = reelItems.sort(() => Math.random() - 0.5);
		const itemsForReel = shuffled.slice(0, 3);

		return {
			siteConfig: SITE_CONFIG,
			items: itemsForReel,
			filters: {
				name: nameFilter,
				location: locationFilter,
				category: categoryFilter,
			},
			isInfoReel: true,
			totalCount: itemsForReel.length,
			currentPage: 1,
			pageSize: PAGE_SIZE,
			uniqueLocations,
			uniqueCategories,
			relationsMap: {} as Record<string, RelationBadgeData[]>,
			languages,
		};
	}

	if (nameFilter) {
		const searchTerm = nameFilter.toLowerCase();
		items = items.filter((item) =>
			item.name.toLowerCase().includes(searchTerm),
		);
	}
	if (locationFilter && locationFilter !== "all") {
		const searchTerm = locationFilter.toLowerCase();
		items = items.filter(
			(item) =>
				(item.location ?? "missing location").toLowerCase() === searchTerm,
		);
	}
	if (categoryFilter && categoryFilter !== "all") {
		const searchTerm = categoryFilter.toLowerCase();
		items = items.filter(
			(item) => (item.category || "").toLowerCase() === searchTerm,
		);
	}

	items = items.sort((a, b) => a.name.localeCompare(b.name, "fi"));
	const totalCount = items.length;
	const startIndex = (page - 1) * PAGE_SIZE;
	const paginatedItems = items.slice(startIndex, startIndex + PAGE_SIZE);
	const inventoryIds = paginatedItems.map((item) => item.id);
	const relationsMap = await loadRelationsMapForEntities(
		db,
		"inventory",
		inventoryIds,
		undefined,
		permissions,
	);

	const serializedRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of relationsMap) {
		serializedRelationsMap[id] = relations;
	}

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
		relationsMap: serializedRelationsMap,
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

	if (actionType === "createItem") {
		const newItem: NewInventoryItem = {
			name: formData.get("name") as string,
			quantity: parseInt(formData.get("quantity") as string, 10) || 1,
			location: formData.get("location") as string,
			category: (formData.get("category") as string) || null,
			description: (formData.get("description") as string) || null,
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

	if (actionType === "unlinkFromTransaction") {
		const itemId = formData.get("itemId") as string;
		const transactionId = formData.get("transactionId") as string;

		if (itemId && transactionId) {
			await db.deleteEntityRelationshipByPair(
				"inventory",
				itemId,
				"transaction",
				transactionId,
			);
		}
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
		relationsMap,
		languages,
	} = loaderData;
	const { hasPermission } = useUser();
	const canWrite = hasPermission("inventory:write");
	const canDelete = hasPermission("inventory:delete");
	const canExport = hasPermission("inventory:export");
	const canImport = hasPermission("inventory:import");

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
			relationsMap={relationsMap || {}}
		>
			{isInfoReel ? (
				<InventoryInfoReelPage languages={languages} />
			) : (
				<InventoryTablePage
					languages={languages}
					canExport={canExport}
					canImport={canImport}
				/>
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
	canExport,
	canImport,
}: {
	languages: { primary: string; secondary: string };
	canExport: boolean;
	canImport: boolean;
}) {
	const {
		items,
		totalCount,
		currentPage,
		pageSize,
		isStaff,
		selectedIds,
		setSelectedIds,
		visibleColumns,
		handlePageChange,
		handleDeleteSelected,
		uniqueLocations,
		uniqueCategories,
		relationsMap,
	} = useInventory();

	const navigation = useNavigation();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const isLoading = navigation.state === "loading";

	const { t } = useTranslation();

	const searchFields: SearchField[] = [
		{
			name: "name",
			label: t("inventory.search.name_label"),
			type: "text",
			placeholder: t("inventory.search.name_placeholder"),
		},
		{
			name: "location",
			label: t("inventory.search.location_label"),
			type: "select",
			placeholder: t("inventory.search.location_all"),
			options: ["all", ...uniqueLocations.filter(Boolean)],
		},
		{
			name: "category",
			label: t("inventory.search.category_label"),
			type: "select",
			placeholder: t("inventory.search.category_all"),
			options: ["all", ...uniqueCategories.filter(Boolean)],
		},
	];

	const permissions = rootData?.user?.permissions || [];
	const canEdit = isStaff || permissions.includes("*") || permissions.includes("inventory:write") || permissions.includes("inventory:update");

	const columns = useInventoryColumns({
		visibleColumns,
		canEdit,
		isStaff,
		uniqueCategories,
		itemNames: items.map((i) => i.name),
		relationsMap,
	});

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2">
			<SearchMenu fields={searchFields} />
			{isStaff && (
				<AddItemButton
					title={t("inventory.actions.add")}
					variant="icon"
					createType="inventory"
				/>
			)}
		</div>
	);

	return (
		<PageWrapper>
			<SplitLayout
				canExport={canExport}
				canImport={canImport}
				header={{
					primary: t("inventory.title", { lng: languages.primary }),
					secondary: t("inventory.title", { lng: languages.secondary }),
				}}
				footer={footerContent}
			>
				<div
					className={`space-y-4 transition-opacity duration-200 ${isLoading ? "opacity-50" : ""}`}
				>
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
						selectedIds={selectedIds}
						onDeleteSelected={isStaff ? handleDeleteSelected : undefined}
						basePath="/inventory"
						canEdit={canEdit}
						maxBodyHeight="calc(100vh - 280px)"
						deleteConfirmTitle={t("inventory.modals.confirm_delete_many_title")}
						deleteConfirmDesc={t("inventory.modals.confirm_delete_many_desc", {
							count: selectedIds.length ?? 0,
						})}
						deleteConfirmLabel={t("common.actions.delete")}
						deleteCancelLabel={t("inventory.modals.cancel")}
					/>
				</div>
			</SplitLayout>
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
