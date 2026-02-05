import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	Link,
	useNavigate,
	useRouteLoaderData,
	useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import {
	TreasuryTable,
	TREASURY_TABLE_STYLES,
} from "~/components/treasury/treasury-table";
import { useReimbursementTemplate } from "~/contexts/reimbursement-template-context";
import {
	getDatabase,
	type InventoryItem,
	type Purchase,
	type PurchaseStatus,
} from "~/db";
import {
	requirePermission,
	requireDeletePermissionOrSelf,
} from "~/lib/auth.server";
import { createReimbursementStatusNotification } from "~/lib/notifications.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/treasury.reimbursements";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Kulukorvaukset / Reimbursements`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "reimbursements:read", getDatabase);
	const db = getDatabase();
	const url = new URL(request.url);
	const status = url.searchParams.get("status") || "all";
	const year = url.searchParams.get("year") || String(new Date().getFullYear());

	let purchases = await db.getPurchases();

	// Filter by year
	if (year !== "all") {
		purchases = purchases.filter((p) => p.year === parseInt(year, 10));
	}

	// Filter by status
	if (status !== "all") {
		purchases = purchases.filter((p) => p.status === status);
	}

	// Sort by date descending
	purchases.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	// Get inventory items for display
	const inventoryItems = await db.getInventoryItems();
	const itemsMap = new Map(inventoryItems.map((item) => [item.id, item]));

	// Check which purchases have linked transactions and create map of purchase ID to transaction ID
	const purchasesWithLinkedTransactions = new Set<string>();
	const purchaseTransactionMap = new Map<string, string>();
	for (const purchase of purchases) {
		const linkedTransaction = await db.getTransactionByPurchaseId(purchase.id);
		if (linkedTransaction) {
			purchasesWithLinkedTransactions.add(purchase.id);
			purchaseTransactionMap.set(purchase.id, linkedTransaction.id);
		}
	}

	// Enrich purchases
	const enrichedPurchases = purchases.map((p) => ({
		...p,
		inventoryItem: p.inventoryItemId ? itemsMap.get(p.inventoryItemId) : null,
		hasLinkedTransaction: purchasesWithLinkedTransactions.has(p.id),
	}));

	// Get unique years from purchases
	const allPurchases = await db.getPurchases();
	const years = [...new Set(allPurchases.map((p) => p.year))].sort(
		(a, b) => b - a,
	);

	// Batch resolve creator names
	const creatorIds = [
		...new Set(
			enrichedPurchases
				.map((p) => p.createdBy)
				.filter((id): id is string => Boolean(id)),
		),
	];
	const creatorUsers = await Promise.all(
		creatorIds.map((id) => db.findUserById(id)),
	);
	const creatorsMap = new Map<string, string>();
	creatorIds.forEach((id, i) => {
		if (creatorUsers[i]) creatorsMap.set(id, creatorUsers[i].name);
	});

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		purchases: enrichedPurchases,
		purchaseTransactionMap: Object.fromEntries(purchaseTransactionMap),
		years,
		currentYear: parseInt(year, 10) || new Date().getFullYear(),
		currentStatus: status,
		systemLanguages,
		creatorsMap: Object.fromEntries(creatorsMap),
	};
}

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action");
	const purchaseId = formData.get("purchaseId") as string;

	if (actionType === "updateStatus" && purchaseId) {
		// Updating status requires update permission
		await requirePermission(request, "reimbursements:update", getDatabase);

		const newStatus = formData.get("status") as PurchaseStatus;
		await db.updatePurchase(purchaseId, { status: newStatus });

		// Get purchase to check createdBy for notification
		const purchase = await db.getPurchaseById(purchaseId);
		if (purchase) {
			// Send notification if status changed to approved/rejected/reimbursed
			if (newStatus === "approved" || newStatus === "rejected" || newStatus === "reimbursed") {
				// Use "approved" for both approved and reimbursed status
				const notificationStatus = newStatus === "rejected" ? "rejected" : "approved";
				await createReimbursementStatusNotification(
					purchase,
					notificationStatus,
					db,
				);
			}
		}

		// Also update the linked transaction's reimbursementStatus and status
		const linkedTransaction = await db.getTransactionByPurchaseId(purchaseId);
		if (linkedTransaction) {
			// Map purchase status to transaction reimbursementStatus and status
			let newReimbursementStatus:
				| "requested"
				| "approved"
				| "declined"
				| "not_requested" = "requested";
			let newTransactionStatus: "pending" | "complete" | "paused" | "declined" =
				"pending";

			if (newStatus === "approved" || newStatus === "reimbursed") {
				newReimbursementStatus = "approved";
				newTransactionStatus = "complete";
			} else if (newStatus === "rejected") {
				newReimbursementStatus = "declined";
				newTransactionStatus = "declined";
			} else if (newStatus === "pending") {
				newReimbursementStatus = "requested";
				newTransactionStatus = "pending";
			}
			await db.updateTransaction(linkedTransaction.id, {
				reimbursementStatus: newReimbursementStatus,
				status: newTransactionStatus,
			});
		}
	} else if (actionType === "delete" && purchaseId) {
		// Get purchase to check createdBy for self-delete permission
		const purchase = await db.getPurchaseById(purchaseId);
		if (!purchase) {
			return { success: false, error: "Purchase not found" };
		}

		// Check delete permission with self-delete support
		await requireDeletePermissionOrSelf(
			request,
			"reimbursements:delete",
			"reimbursements:delete-self",
			purchase.createdBy,
			getDatabase,
		);

		// Decline linked transaction before deleting purchase
		const linkedTransaction = await db.getTransactionByPurchaseId(purchaseId);
		if (linkedTransaction) {
			await db.updateTransaction(linkedTransaction.id, {
				status: "declined",
				reimbursementStatus: "declined",
			});
		}

		await db.deletePurchase(purchaseId);
	}

	return { success: true };
}

// Helper for status colors - kept outside as it doesn't need translation
const statusColors = {
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
	approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	reimbursed:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
	rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function BudgetReimbursements({
	loaderData,
}: Route.ComponentProps) {
	const {
		purchases,
		purchaseTransactionMap,
		years,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const [searchParams, setSearchParams] = useSearchParams();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const isStaff =
		rootData?.user?.roleName === "Admin" ||
		rootData?.user?.roleName === "Board Member";
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { setTemplate } = useReimbursementTemplate();

	useEffect(() => {
		const success = searchParams.get("success");
		if (!success) return;
		if (success === "reimbursement_requested") {
			toast.success(t("treasury.success.reimbursement_requested"));
		} else {
			toast.success(success);
		}
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("success");
		setSearchParams(nextParams, { replace: true });
	}, [searchParams, setSearchParams, t]);

	const formatCurrency = (value: number | string) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);

	const handleUseAsTemplate = (purchase: Purchase) => {
		setTemplate({
			description: purchase.description || "",
			amount: purchase.amount,
			purchaserName: purchase.purchaserName,
			bankAccount: purchase.bankAccount,
			notes: purchase.notes || undefined,
		});
		navigate("/treasury/reimbursement/new");
	};

	if (!isStaff) {
		return (
			<PageWrapper>
				<div className="p-8 text-center">
					<p className="text-gray-500">
						{t("treasury.reimbursements.access_denied")}
					</p>
				</div>
			</PageWrapper>
		);
	}

	// Configure search fields
	const statusOptions = ["all", "pending", "approved", "reimbursed", "rejected"];
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options: years.length > 0 ? years.map(String) : [String(new Date().getFullYear())],
		},
		{
			name: "status",
			label: t("common.fields.status"),
			type: "select",
			placeholder: t("common.actions.all"),
			options: statusOptions,
		},
	];

	const footerContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
			{isStaff && (
				<AddItemButton
					to="/treasury/reimbursement/new"
					title={t("treasury.reimbursements.new")}
					variant="icon"
				/>
			)}
		</div>
	);

	type PurchaseRow = Purchase & {
		inventoryItem?: InventoryItem | null;
		hasLinkedTransaction: boolean;
	};

	// Canonical treasury column order: Date, Name/Description, Category, Type, Status, Created by, [route-specific], Amount
	const columns = [
		{
			key: "date",
			header: t("common.fields.date"),
			cell: (row: PurchaseRow) => formatDate(row.createdAt),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "description",
			header: t("common.fields.description"),
			cell: (row: PurchaseRow) =>
				row.inventoryItem?.name || row.description || "—",
			cellClassName: "font-medium max-w-[200px] truncate",
		},
		{
			key: "purchaser",
			header: t("treasury.reimbursements.purchaser"),
			cell: (row: PurchaseRow) => row.purchaserName,
		},
		{
			key: "status",
			header: t("common.fields.status"),
			cell: (row: PurchaseRow) => {
				const canApprove =
					rootData?.user?.permissions?.includes("reimbursements:update") ||
					rootData?.user?.permissions?.includes("*");
				const statusKey = row.status as keyof typeof statusColors;
				const statusColor =
					statusColors[statusKey] || statusColors.pending;
				if (canApprove) {
					return (
						<Form method="post" className="inline-block">
							<input type="hidden" name="_action" value="updateStatus" />
							<input type="hidden" name="purchaseId" value={row.id} />
							<select
								name="status"
								defaultValue={row.status}
								onChange={(e) => e.target.form?.requestSubmit()}
								className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 ${statusColor}`}
							>
								<option value="pending">
									{t("treasury.reimbursements.statuses.pending")}
								</option>
								<option value="approved">
									{t("treasury.reimbursements.statuses.approved")}
								</option>
								<option value="reimbursed">
									{t("treasury.reimbursements.statuses.reimbursed")}
								</option>
								<option value="rejected">
									{t("treasury.reimbursements.statuses.rejected")}
								</option>
							</select>
						</Form>
					);
				}
				return (
					<TreasuryStatusPill
						value={row.status}
						variantMap={statusColors}
						label={t(`treasury.reimbursements.statuses.${row.status}`)}
					/>
				);
			},
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: PurchaseRow) =>
				row.createdBy ? creatorsMap.get(row.createdBy) ?? "—" : "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "transaction",
			header: t("treasury.reimbursements.transaction"),
			cell: (row: PurchaseRow) =>
				purchaseTransactionMap[row.id] ? (
					<Link
						to={`/treasury/transactions/${purchaseTransactionMap[row.id]}`}
						className="inline-flex items-center text-primary hover:underline"
						title={t("treasury.reimbursements.view_transaction")}
					>
						<span className="material-symbols-outlined text-base">
							link
						</span>
					</Link>
				) : (
					<span className="text-gray-400">—</span>
				),
		},
		{
			key: "email",
			header: "📧",
			headerClassName: "text-center",
			cell: (row: PurchaseRow) =>
				row.emailSent ? (
					<span
						className="text-green-600"
						title={t("treasury.reimbursements.email_sent")}
					>
						✓
					</span>
				) : row.emailError ? (
					<span
						className="text-red-600"
						title={row.emailError}
					>
						✗
					</span>
				) : (
					<span className="text-gray-400">—</span>
				),
		},
		{
			key: "reply",
			header: "💬",
			headerClassName: "text-center",
			cell: (row: PurchaseRow) =>
				row.emailReplyReceived ? (
					<span
						className="text-blue-600 cursor-help"
						title={
							row.emailReplyContent ||
							t("treasury.reimbursements.reply_received")
						}
					>
						💬
					</span>
				) : (
					<span className="text-gray-400">—</span>
				),
		},
		{
			key: "amount",
			header: t("common.fields.amount"),
			headerClassName: "text-right",
			align: "right" as const,
			cell: (row: PurchaseRow) => formatCurrency(row.amount),
			cellClassName: TREASURY_TABLE_STYLES.AMOUNT_CELL,
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.reimbursements.title", { lng: systemLanguages.primary }),
					secondary: t("treasury.reimbursements.title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
				footer={footerContent}
			>
				<div className="space-y-6">
					<TreasuryTable<PurchaseRow>
						data={purchases}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(purchase) => {
							const canDeleteGeneral =
								rootData?.user?.permissions?.includes(
									"reimbursements:delete",
								) || rootData?.user?.permissions?.includes("*");
							const canDeleteSelf =
								rootData?.user?.permissions?.includes(
									"reimbursements:delete-self",
								) &&
								purchase.createdBy &&
								rootData?.user?.userId === purchase.createdBy;
							const canDelete = canDeleteGeneral || canDeleteSelf;
							const canUpdateGeneral =
								rootData?.user?.permissions?.includes(
									"reimbursements:update",
								) || rootData?.user?.permissions?.includes("*");
							const canUpdateSelf =
								rootData?.user?.permissions?.includes(
									"reimbursements:update-self",
								) &&
								purchase.createdBy &&
								rootData?.user?.userId === purchase.createdBy;
							const canUpdate = canUpdateGeneral || canUpdateSelf;

							return (
								<TreasuryActionCell
									viewTo={`/treasury/reimbursements/${purchase.id}`}
									viewTitle={t("common.actions.view")}
									editTo={`/treasury/reimbursements/${purchase.id}/edit`}
									editTitle={t("common.actions.edit")}
									canEdit={Boolean(canUpdate)}
									copyProps={{
										onClick: () => handleUseAsTemplate(purchase),
										title: t("treasury.reimbursements.use_as_template"),
									}}
									deleteProps={
										canDelete
											? {
													hiddenFields: {
														_action: "delete",
														purchaseId: purchase.id,
													},
													confirmMessage: t(
														"treasury.reimbursements.delete_confirm",
													),
													title: t("common.actions.delete"),
												}
											: undefined
									}
								/>
							);
						}}
						emptyState={{
							title: t("treasury.no_transactions"),
						}}
						totals={{
							labelColSpan: 9,
							columns: [
								{
									value: purchases.reduce(
										(sum, p) => sum + parseFloat(p.amount),
										0,
									),
								},
							],
							trailingColSpan: 1,
							formatCurrency,
						}}
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
