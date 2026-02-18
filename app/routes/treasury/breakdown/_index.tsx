import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	TREASURY_BUDGET_STATUS_VARIANTS,
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";
import {
	ContentArea,
	PageWrapper,
	SplitLayout,
} from "~/components/layout/page-layout";
import { RelationsColumn } from "~/components/relations-column";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import {
	TREASURY_TABLE_STYLES,
	TreasuryTable,
} from "~/components/treasury/treasury-table";
import { useUser } from "~/contexts/user-context";
import { getDatabase, type Transaction } from "~/db/server.server";
import {
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Rahastoerittely / Treasury Breakdown`,
		},
		{ name: "description", content: "Toimikunnan rahastoerittely" },
	];
}

export async function action({ request }: Route.ActionArgs) {}

export async function loader({ request }: Route.LoaderArgs) {
	// Require either treasury:breakdown:read or treasury:breakdown:read-self permission
	// Note: Breakdown always shows all transactions regardless of permission level
	const user = await requireAnyPermission(
		request,
		["treasury:breakdown:read"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const typeParam = url.searchParams.get("type");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		throw new Response("Invalid year", { status: 400 });
	}

	// Breakdown always shows all transactions (aggregate view)
	const allTransactionsForYear = await db.getTransactionsByYear(year);

	// Filter out pending/declined reimbursements - they shouldn't affect the budget yet
	// Only include transactions that are either:
	// - not_requested: normal transaction, no reimbursement needed
	// - approved: reimbursement was approved and will be paid
	// Exclude:
	// - requested: waiting for approval
	// - declined: rejected, won't be paid
	const isIncludedInBreakdown = (t: Transaction) =>
		t.status !== "draft" &&
		(!t.reimbursementStatus ||
			t.reimbursementStatus === "not_requested" ||
			t.reimbursementStatus === "approved");

	let transactions = allTransactionsForYear.filter(isIncludedInBreakdown);

	// Filter by type if specified
	if (typeParam && typeParam !== "all") {
		transactions = transactions.filter((t) => t.type === typeParam);
	}

	// Calculate totals from transactions before category/type filtering (for summary cards)
	const transactionsForTotals = allTransactionsForYear.filter(
		isIncludedInBreakdown,
	);

	const totalExpenses = transactionsForTotals
		.filter((t) => t.type === "expense")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const totalIncome = transactionsForTotals
		.filter((t) => t.type === "income")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const balance = totalIncome - totalExpenses;

	const yearBudgets = (await db.getFundBudgetsByYear(year)).filter(
		(budget) => budget.status !== "draft",
	);
	const budgetLinkedTransactionIds = new Set<string>();
	const excludedTransactionIds = new Set(
		allTransactionsForYear
			.filter((t) => !isIncludedInBreakdown(t))
			.map((t) => t.id),
	);
	const transactionsById = new Map(
		allTransactionsForYear.map((transaction) => [transaction.id, transaction]),
	);
	const budgetSummaries = await Promise.all(
		yearBudgets.map(async (budget) => {
			const relationships = await db.getEntityRelationships(
				"budget",
				budget.id,
			);
			const linkedTransactionIds = relationships
				.filter(
					(rel) =>
						(rel.relationAType === "budget" &&
							rel.relationId === budget.id &&
							rel.relationBType === "transaction") ||
						(rel.relationBType === "budget" &&
							rel.relationBId === budget.id &&
							rel.relationAType === "transaction"),
				)
				.map((rel) =>
					rel.relationAType === "transaction"
						? rel.relationId
						: rel.relationBId,
				);

			for (const transactionId of linkedTransactionIds) {
				budgetLinkedTransactionIds.add(transactionId);
			}

			const linkedTransactions = linkedTransactionIds
				.map((id) => transactionsById.get(id))
				.filter((transaction): transaction is Transaction =>
					Boolean(transaction && isIncludedInBreakdown(transaction)),
				);
			const usedAmount = linkedTransactions.reduce((sum, transaction) => {
				if (transaction.type === "expense" && transaction.status === "complete") {
					return sum + parseFloat(transaction.amount);
				}
				return sum;
			}, 0);
			const reservedAmount = linkedTransactions.reduce((sum, transaction) => {
				if (
					transaction.type === "expense" &&
					(transaction.status === "pending" || transaction.status === "paused")
				) {
					return sum + parseFloat(transaction.amount);
				}
				return sum;
			}, 0);
			const remainingAmount =
				Number.parseFloat(budget.amount) - usedAmount - reservedAmount;

			return {
				...budget,
				usedAmount,
				reservedAmount,
				remainingAmount,
				linkedTransactionCount: linkedTransactionIds.length,
			};
		}),
	);
	const budgetIds = budgetSummaries.map((budget) => budget.id);
	const budgetRelationsMap = await loadRelationsMapForEntities(
		db,
		"budget",
		budgetIds,
		undefined,
		user.permissions,
	);

	const budgetedTransactions = transactionsForTotals
		.filter((t) => budgetLinkedTransactionIds.has(t.id))
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);
	const budgetLinkedExpenses = transactionsForTotals
		.filter((t) => t.type === "expense" && budgetLinkedTransactionIds.has(t.id))
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);
	const unbudgetedTransactions = totalExpenses - budgetLinkedExpenses;
	const totalReserved = budgetSummaries
		.filter((budget) => budget.status === "open")
		.reduce((sum, budget) => sum + Math.max(0, budget.remainingAmount), 0);
	const available = balance - totalReserved;

	// Sort by date descending
	const sortedTransactions = transactions.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);
	const transactionIds = sortedTransactions.map((transaction) => transaction.id);
	const transactionRelationsMap = await loadRelationsMapForEntities(
		db,
		"transaction",
		transactionIds,
		undefined,
		user.permissions,
	);

	// Get all years with transactions for navigation
	const allTransactions = await db.getAllTransactions();
	const years = [...new Set(allTransactions.map((t) => t.year))].sort(
		(a, b) => b - a,
	);

	// Batch resolve creator names
	const creatorIds = [
		...new Set(
			[...sortedTransactions, ...budgetSummaries]
				.map((entity) => entity.createdBy)
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
	const serializedBudgetRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of budgetRelationsMap) {
		serializedBudgetRelationsMap[id] = relations;
	}
	const serializedTransactionRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of transactionRelationsMap) {
		serializedTransactionRelationsMap[id] = relations;
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		year,
		transactions: sortedTransactions,
		totalExpenses,
		totalIncome,
		balance,
		budgetedTransactions,
		unbudgetedTransactions,
		totalReserved,
		available,
		budgetSummaries,
		budgetRelationsMap: serializedBudgetRelationsMap,
		transactionRelationsMap: serializedTransactionRelationsMap,
		years,
		systemLanguages,
		creatorsMap: Object.fromEntries(creatorsMap),
	};
}

/**
 * Import button component with file input
 */
function ImportButton({ year }: { year: number }) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setIsImporting(true);

		const formData = new FormData();
		formData.append("file", file);
		formData.append("year", String(year));

		try {
			const response = await fetch("/api/treasury/import", {
				method: "POST",
				body: formData,
			});

			const result = await response.json();

			if (result.success) {
				toast.success(
					t("treasury.breakdown.import_success", { count: result.imported }),
				);
				// Reload the page to show new transactions
				window.location.reload();
			} else {
				toast.error(result.error || t("treasury.breakdown.import_error"));
			}
		} catch (_error) {
			toast.error(t("treasury.breakdown.import_error"));
		} finally {
			setIsImporting(false);
			// Reset the file input
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv,.xlsx,.xls"
				className="hidden"
				onChange={handleFileChange}
			/>
			<button
				type="button"
				onClick={() => fileInputRef.current?.click()}
				className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
				title={t("treasury.breakdown.import")}
				disabled={isImporting}
			>
				{isImporting ? (
					<span className="material-symbols-outlined text-xl animate-spin">
						progress_activity
					</span>
				) : (
					<span className="material-symbols-outlined text-xl">upload</span>
				)}
			</button>
		</>
	);
}

export default function TreasuryBreakdown({
	loaderData,
}: Route.ComponentProps) {
	const {
		year,
		transactions,
		totalIncome,
		totalExpenses,
		balance,
		budgetedTransactions,
		unbudgetedTransactions,
		totalReserved,
		available,
		budgetSummaries,
		budgetRelationsMap: budgetRelationsMapRaw,
		transactionRelationsMap: transactionRelationsMapRaw,
		years,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const budgetRelationsMap = new Map(
		Object.entries(budgetRelationsMapRaw ?? {}) as [
			string,
			RelationBadgeData[],
		][],
	);
	const transactionRelationsMap = new Map(
		Object.entries(transactionRelationsMapRaw ?? {}) as [
			string,
			RelationBadgeData[],
		][],
	);
	const { hasPermission, user } = useUser();
	const canExport = hasPermission("treasury:export");
	const canImport = hasPermission("treasury:import");

	// Helper to check if user can edit a specific transaction
	const canViewTransaction = (transaction: Transaction) =>
		hasPermission("treasury:transactions:read") ||
		(hasPermission("treasury:transactions:read-self") &&
			transaction.createdBy &&
			user?.userId === transaction.createdBy);
	const canViewBudget = (budget: (typeof budgetSummaries)[number]) =>
		hasPermission("treasury:budgets:read") ||
		(hasPermission("treasury:budgets:read-self") &&
			budget.createdBy &&
			user?.userId === budget.createdBy);
	const { t, i18n } = useTranslation();

	const formatCurrency = (value: number | string) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) => {
		return new Date(date).toLocaleDateString(i18n.language);
	};

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options:
				years.length > 0
					? years.map(String)
					: [String(new Date().getFullYear())],
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
			{canImport && <ImportButton year={year} />}
			{canExport && (
				<a
					href={`/api/treasury/export?year=${year}`}
					download={`transactions-${year}.csv`}
					className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
					title={t("treasury.breakdown.export")}
				>
					<span className="material-symbols-outlined text-xl">download</span>
				</a>
			)}
		</div>
	);

	// Canonical treasury column order: Date, Name/Description, Status, Created by, Amount
	const columns = [
		{
			key: "date",
			header: t("treasury.breakdown.date"),
			align: "left" as const,
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
			key: "status",
			header: t("treasury.breakdown.status"),
			cell: (row: Transaction) => (
				<TreasuryStatusPill
					value={row.status}
					variantMap={TREASURY_TRANSACTION_STATUS_VARIANTS}
					label={t(`treasury.breakdown.actions.edit.status.${row.status}`, {
						defaultValue: row.status,
					})}
				/>
			),
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: Transaction) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "relations",
			header: t("common.relations.title"),
			headerClassName: "text-center",
			cellClassName: "text-center",
			cell: (row: Transaction) => (
				<RelationsColumn relations={transactionRelationsMap.get(row.id) || []} />
			),
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
	type BudgetRow = (typeof budgetSummaries)[number];
	const budgetColumns = [
		{
			key: "date",
			header: t("common.fields.date"),
			cell: (row: BudgetRow) => formatDate(row.createdAt),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "name",
			header: t("treasury.budgets.name"),
			cell: (row: BudgetRow) => <p className="font-medium">{row.name}</p>,
		},
		{
			key: "description",
			header: t("treasury.budgets.description"),
			cell: (row: BudgetRow) =>
				row.description ? (
					<p className="text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
						{row.description}
					</p>
				) : (
					"—"
				),
			cellClassName: "text-gray-500 dark:text-gray-400",
		},
		{
			key: "status",
			header: t("common.fields.status"),
			cell: (row: BudgetRow) => (
				<TreasuryStatusPill
					value={row.status}
					variantMap={TREASURY_BUDGET_STATUS_VARIANTS}
					label={t(`treasury.budgets.statuses.${row.status}`)}
				/>
			),
		},
		{
			key: "createdBy",
			header: t("treasury.budgets.created_by"),
			cell: (row: BudgetRow) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500 dark:text-gray-400",
		},
		{
			key: "relations",
			header: t("common.relations.title"),
			headerClassName: "text-center",
			cellClassName: "text-center",
			cell: (row: BudgetRow) => (
				<RelationsColumn relations={budgetRelationsMap.get(row.id) || []} />
			),
		},
		{
			key: "used",
			header: t("treasury.budgets.used"),
			cell: (row: BudgetRow) => formatCurrency(row.usedAmount),
			cellClassName: "text-gray-600 dark:text-gray-400",
		},
		{
			key: "reserved",
			header: t("treasury.budgets.reserved"),
			cell: (row: BudgetRow) => formatCurrency(row.reservedAmount),
			cellClassName: "text-yellow-600 dark:text-yellow-400",
		},
		{
			key: "remaining",
			header: t("treasury.budgets.remaining"),
			cell: (row: BudgetRow) => formatCurrency(row.remainingAmount),
			cellClassName: (row: BudgetRow) =>
				`font-semibold ${
					row.remainingAmount > 0
						? "text-green-600 dark:text-green-400"
						: "text-gray-500"
				}`,
		},
		{
			key: "amount",
			header: t("treasury.budgets.amount"),
			headerClassName: "text-right",
			align: "right" as const,
			cell: (row: BudgetRow) => formatCurrency(Number.parseFloat(row.amount)),
			cellClassName: TREASURY_TABLE_STYLES.AMOUNT_CELL,
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: `${t("treasury.breakdown.title", { lng: systemLanguages.primary })} ${year}`,
					secondary: `${t("treasury.breakdown.title", { lng: systemLanguages.secondary ?? systemLanguages.primary })} ${year}`,
				}}
				footer={footerContent}
			>
				<ContentArea className="space-y-6">
					<div className="bg-card rounded-2xl border border-border p-5 space-y-4">
						<div>
							<p className="text-sm font-semibold text-muted-foreground">
								{t("treasury.available", { defaultValue: "Available" })}
							</p>
							<p
								className={`text-3xl font-black ${
									available >= 0
										? "text-blue-600 dark:text-blue-400"
										: "text-red-600 dark:text-red-400"
								}`}
							>
								{formatCurrency(available)}
							</p>
						</div>
						<div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
							<div>
								<p className="text-muted-foreground">
									{t("treasury.income", { defaultValue: "Income" })}
								</p>
								<p className="font-semibold text-green-600 dark:text-green-400">
									+{formatCurrency(totalIncome)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground">
									{t("treasury.expenses", { defaultValue: "Expenses" })}
								</p>
								<p className="font-semibold text-red-600 dark:text-red-400">
									-{formatCurrency(totalExpenses)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground">
									{t("treasury.balance", { defaultValue: "Balance" })}
								</p>
								<p className="font-semibold">{formatCurrency(balance)}</p>
							</div>
							<div>
								<p className="text-muted-foreground">
									{t("treasury.unbudgeted_transactions", {
										defaultValue: "Unbudgeted transactions",
									})}
								</p>
								<p className="font-semibold text-red-600 dark:text-red-400">
									-{formatCurrency(unbudgetedTransactions)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground">
									{t("treasury.budgeted_transactions", {
										defaultValue: "Budgeted transactions",
									})}
								</p>
								<p className="font-semibold text-amber-600 dark:text-amber-400">
									-{formatCurrency(budgetedTransactions)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground">
									{t("treasury.budget_costs", { defaultValue: "Budget costs" })}
								</p>
								<p className="font-semibold text-amber-600 dark:text-amber-400">
									{formatCurrency(totalReserved)}
								</p>
							</div>
						</div>
					</div>

					<div className="space-y-3">
						<div>
							<h2 className="text-lg font-semibold">
								{t("treasury.budgets.title", { defaultValue: "Budgets" })}
							</h2>
						</div>
						<TreasuryTable<BudgetRow>
							data={budgetSummaries}
							columns={budgetColumns}
							getRowKey={(row) => row.id}
							renderActions={(budget) => (
								<TreasuryActionCell
									viewTo={
										canViewBudget(budget)
											? `/treasury/budgets/${budget.id}`
											: undefined
									}
									viewTitle={t("common.actions.view")}
								/>
							)}
							emptyState={{
								title: t("treasury.budgets.no_budgets", {
									defaultValue: "No budgets",
							}),
						}}
							totals={{
								labelColSpan: 7,
							columns: [
								{
									value: budgetSummaries.reduce(
										(sum, r) => sum + r.usedAmount,
										0,
									),
								},
								{
									value: budgetSummaries.reduce(
										(sum, r) => sum + r.reservedAmount,
										0,
									),
								},
								{
									value: budgetSummaries.reduce(
										(sum, r) => sum + r.remainingAmount,
										0,
									),
								},
								{
									value: budgetSummaries.reduce(
										(sum, r) => sum + Number.parseFloat(r.amount),
										0,
									),
								},
								],
								trailingColSpan: 1,
								formatCurrency,
							}}
						/>
					</div>

					<div className="space-y-3">
						<div>
							<h2 className="text-lg font-semibold">
								{t("treasury.transactions.title", {
									defaultValue: "Transactions",
								})}
							</h2>
						</div>
						<TreasuryTable<Transaction>
							data={transactions}
							columns={columns}
							getRowKey={(row) => row.id}
							renderActions={(transaction) => (
								<TreasuryActionCell
									viewTo={
										canViewTransaction(transaction)
											? `/treasury/transactions/${transaction.id}`
											: undefined
									}
									viewTitle={t("common.actions.view")}
								/>
							)}
						emptyState={{
							title: t("treasury.breakdown.no_transactions"),
						}}
							totals={{
								labelColSpan: 6,
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
							actionsColumnWidth="w-16"
						/>
					</div>
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
