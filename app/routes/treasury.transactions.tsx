import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
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
import { ViewScopeDisclaimer } from "~/components/treasury/view-scope-disclaimer";
import { useUser } from "~/contexts/user-context";
import { getDatabase, type Transaction } from "~/db";
import {
	requireAnyPermission,
	hasAnyPermission,
	type RBACDatabaseAdapter,
} from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.transactions";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Tapahtumat / Transactions`,
		},
		{ name: "description", content: "Kaikki rahastotapahtumat / All treasury transactions" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	// Require either treasury:transactions:read or treasury:transactions:read-self permission
	const user = await requireAnyPermission(
		request,
		[
			"treasury:transactions:read",
			"treasury:transactions:read-self",
		],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	// Check if user can read all transactions or only their own
	const canReadAll = hasAnyPermission(user, [
		"treasury:transactions:read",
	]);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const statusParam = url.searchParams.get("status");
	const categoryParam = url.searchParams.get("category");
	const typeParam = url.searchParams.get("type");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		throw new Response("Invalid year", { status: 400 });
	}

	// Get ALL transactions for the year (no filtering by reimbursement status)
	let allTransactions = await db.getTransactionsByYear(year);

	// Filter transactions: if user only has read-self, show only their own transactions
	if (!canReadAll) {
		allTransactions = allTransactions.filter((t) => t.createdBy === user.userId);
	}

	// Filter by status if specified
	let transactions = allTransactions;
	if (statusParam && statusParam !== "all") {
		transactions = transactions.filter((t) => t.status === statusParam);
	}

	// Filter by category if specified
	if (categoryParam && categoryParam !== "all") {
		transactions = transactions.filter((t) => t.category === categoryParam);
	}

	// Filter by type if specified
	if (typeParam && typeParam !== "all") {
		transactions = transactions.filter((t) => t.type === typeParam);
	}

	// Sort by date descending
	const sortedTransactions = transactions.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	// Calculate totals (from all transactions, not filtered)
	const totalExpenses = allTransactions
		.filter((t) => t.type === "expense")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const totalIncome = allTransactions
		.filter((t) => t.type === "income")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	// Get all years with transactions for navigation
	const allYearTransactions = await db.getAllTransactions();
	const years = [...new Set(allYearTransactions.map((t) => t.year))].sort(
		(a, b) => b - a,
	);

	// Get unique statuses for filter
	const statuses = [...new Set(allTransactions.map((t) => t.status))];

	// Get unique categories for filter (excluding null/empty)
	const categories = [...new Set(allTransactions.map((t) => t.category).filter((c): c is string => Boolean(c)))];

	// Batch resolve creator names
	const creatorIds = [
		...new Set(
			sortedTransactions
				.map((t) => t.createdBy)
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

	// Fetch budgets for each transaction
	const budgetMap = new Map<string, string>();
	for (const transaction of sortedTransactions) {
		const budgetLink = await db.getBudgetForTransaction(transaction.id);
		if (budgetLink) {
			budgetMap.set(transaction.id, budgetLink.budget.id);
		}
	}

	// Fetch purchase statuses for transactions with purchaseId
	const purchaseStatusMap = new Map<string, string>();
	const purchaseIds = [
		...new Set(
			sortedTransactions
				.map((t) => t.purchaseId)
				.filter((id): id is string => Boolean(id)),
		),
	];
	for (const purchaseId of purchaseIds) {
		const purchase = await db.getPurchaseById(purchaseId);
		if (purchase) {
			purchaseStatusMap.set(purchaseId, purchase.status);
		}
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		year,
		transactions: sortedTransactions,
		totalExpenses,
		totalIncome,
		years,
		statuses,
		categories,
		currentStatus: statusParam || "all",
		totalCount: allTransactions.length,
		canReadAll,
		budgetMap: Object.fromEntries(budgetMap),
		purchaseStatusMap: Object.fromEntries(purchaseStatusMap),
		systemLanguages,
		creatorsMap: Object.fromEntries(creatorsMap),
	};
}

export default function TreasuryTransactions({
	loaderData,
}: Route.ComponentProps) {
	const {
		transactions,
		years,
		statuses,
		categories,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
		canReadAll,
		budgetMap: budgetMapRaw,
		purchaseStatusMap: purchaseStatusMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const budgetMap = new Map(
		Object.entries(budgetMapRaw ?? {}) as [string, string][],
	);
	const purchaseStatusMap = new Map(
		Object.entries(purchaseStatusMapRaw ?? {}) as [string, string][],
	);
	const [searchParams, setSearchParams] = useSearchParams();
	const { hasPermission, user } = useUser();
	const canEditGeneral = hasPermission("treasury:transactions:update");
	const canEditSelf = hasPermission("treasury:transactions:update-self");
	const canWrite = hasPermission("treasury:transactions:write");
	
	// Helper to check if user can edit a specific transaction
	const canEditTransaction = (transaction: Transaction) => {
		if (canEditGeneral) return true;
		if (canEditSelf && transaction.createdBy && user && transaction.createdBy === user.userId) {
			return true;
		}
		return false;
	};

	const canDeleteTransaction = (transaction: Transaction) => {
		const canDeleteGeneral = hasPermission("treasury:transactions:delete");
		const canDeleteSelf =
			hasPermission("treasury:transactions:delete-self") &&
			transaction.createdBy &&
			user?.userId === transaction.createdBy;
		return canDeleteGeneral || canDeleteSelf;
	};
	const { t, i18n } = useTranslation();

	const formatCurrency = (value: number | string) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) => {
		return new Date(date).toLocaleDateString(i18n.language);
	};

	useEffect(() => {
		const success = searchParams.get("success");
		if (success !== "transaction_deleted") return;
		toast.success(t("treasury.success.transaction_deleted"));
		setSearchParams((prev) => {
			prev.delete("success");
			return prev;
		});
	}, [searchParams, setSearchParams, t]);

	// Configure search fields
	const statusOptions = ["all", ...statuses];
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
			placeholder: t("treasury.transactions.all"),
			options: statusOptions,
		},
		{
			name: "category",
			label: t("treasury.breakdown.category"),
			type: "select",
			placeholder: t("common.actions.all"),
			options: categories.length > 0 ? ["all", ...categories] : ["all"],
		},
		{
			name: "type",
			label: t("treasury.transactions.type"),
			type: "select",
			placeholder: t("common.actions.all"),
			options: ["all", "income", "expense"],
		},
	];

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2 min-h-[40px]">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					to="/treasury/transactions/new"
					title={t("treasury.transactions.new")}
					variant="icon"
				/>
			)}
		</div>
	);

	const TYPE_VARIANT_MAP: Record<string, string> = {
		income:
			"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	};
	const STATUS_VARIANT_MAP: Record<string, string> = {
		complete:
			"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		pending:
			"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
		paused: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
		declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	};
	const PURCHASE_STATUS_VARIANT_MAP: Record<string, string> = {
		pending:
			"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
		approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
		reimbursed:
			"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
		rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
	};

	// Canonical treasury column order: Date, Name/Description, Category, Type, Status, Created by, [route-specific], Amount
	const columns = [
		{
			key: "date",
			header: t("treasury.breakdown.date"),
			cell: (row: Transaction) => formatDate(row.date),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "description",
			header: t("treasury.breakdown.description"),
			cell: (row: Transaction) => row.description,
			cellClassName: "font-medium",
		},
		{
			key: "category",
			header: t("treasury.breakdown.category"),
			cell: (row: Transaction) => row.category || "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "type",
			header: t("treasury.transactions.type"),
			cell: (row: Transaction) => (
				<TreasuryStatusPill
					value={row.type}
					variantMap={TYPE_VARIANT_MAP}
					label={t(`treasury.types.${row.type}`, {
						defaultValue: row.type,
					})}
				/>
			),
		},
		{
			key: "status",
			header: t("treasury.transactions.status"),
			cell: (row: Transaction) => (
				<TreasuryStatusPill
					value={row.status}
					variantMap={STATUS_VARIANT_MAP}
					label={t(
						`treasury.breakdown.edit.statuses.${row.status}`,
						{ defaultValue: row.status },
					)}
				/>
			),
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: Transaction) =>
				row.createdBy ? creatorsMap.get(row.createdBy) ?? "—" : "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "budget",
			header: t("treasury.actions.budgets"),
			cell: (row: Transaction) => {
				const budgetId = budgetMap.get(row.id);
				if (!budgetId) {
					return <span className="text-gray-400">—</span>;
				}
				const statusVariant =
					STATUS_VARIANT_MAP[row.status] ||
					"bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
				return (
					<Link
						to={`/treasury/budgets/${budgetId}`}
						className={`inline-flex items-center hover:underline text-sm px-1.5 py-0.5 rounded font-medium ${statusVariant}`}
						title={t("treasury.budgets.view")}
					>
						<span className="material-symbols-outlined text-xs mr-0.5 shrink-0">
							bookmark
						</span>
						{budgetId.substring(0, 8)}
					</Link>
				);
			},
		},
		{
			key: "reimbursement",
			header: t("treasury.receipts.reimbursement_request"),
			cell: (row: Transaction) => {
				if (!row.purchaseId) {
					return <span className="text-gray-400">—</span>;
				}
				const purchaseStatus = purchaseStatusMap.get(row.purchaseId) || "pending";
				const statusVariant =
					PURCHASE_STATUS_VARIANT_MAP[purchaseStatus] ||
					PURCHASE_STATUS_VARIANT_MAP.pending;
				return (
					<Link
						to={`/treasury/reimbursements/${row.purchaseId}`}
						className={`inline-flex items-center hover:underline text-sm px-1.5 py-0.5 rounded font-medium ${statusVariant}`}
					>
						<span className="material-symbols-outlined text-xs mr-0.5 shrink-0">
							link
						</span>
						{row.purchaseId.substring(0, 8)}
					</Link>
				);
			},
		},
		{
			key: "amount",
			header: t("treasury.breakdown.amount"),
			headerClassName: "text-right",
			align: "right" as const,
			cell: (row: Transaction) => (
				<>
					{row.type === "expense" ? "-" : "+"}
					{formatCurrency(row.amount)}
				</>
			),
			cellClassName: (row: Transaction) =>
				`${TREASURY_TABLE_STYLES.AMOUNT_CELL} ${
					row.type === "expense"
						? TREASURY_TABLE_STYLES.AMOUNT_EXPENSE
						: TREASURY_TABLE_STYLES.AMOUNT_INCOME
				}`,
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.transactions.title", { lng: systemLanguages.primary }),
					secondary: t("treasury.transactions.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={footerContent}
			>
				<div className="space-y-6">
					<ViewScopeDisclaimer canReadAll={canReadAll} itemType="transactions" />
					<TreasuryTable<Transaction>
						data={transactions}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(transaction) => (
							<TreasuryActionCell
								viewTo={`/treasury/transactions/${transaction.id}`}
								viewTitle={t("common.actions.view")}
								editTo={`/treasury/transactions/${transaction.id}/edit`}
								editTitle={t("common.actions.edit")}
								canEdit={canEditTransaction(transaction)}
								deleteProps={
									canDeleteTransaction(transaction)
										? {
												action: `/treasury/transactions/${transaction.id}/edit`,
												hiddenFields: { _action: "delete" },
												confirmMessage: t(
													"treasury.breakdown.edit.delete_confirm",
												),
												title: t("common.actions.delete"),
											}
										: undefined
								}
							/>
						)}
						emptyState={{
							title: t("treasury.breakdown.no_transactions"),
						}}
						totals={{
							labelColSpan: 9,
							columns: [
								{
									value: transactions.reduce((sum, tx) => {
										const amount = parseFloat(tx.amount);
										return sum + (tx.type === "expense" ? -amount : amount);
									}, 0),
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
