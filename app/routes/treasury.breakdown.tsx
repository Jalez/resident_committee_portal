import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import {
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import {
	TreasuryTable,
	TREASURY_TABLE_STYLES,
} from "~/components/treasury/treasury-table";
import { useUser } from "~/contexts/user-context";
import { getDatabase, type Transaction } from "~/db";
import {
	requireAnyPermission,
	type RBACDatabaseAdapter,
} from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.breakdown";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Rahastoerittely / Treasury Breakdown`,
		},
		{ name: "description", content: "Toimikunnan rahastoerittely" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	// Require either treasury:breakdown:read or treasury:breakdown:read-self permission
	// Note: Breakdown always shows all transactions regardless of permission level
	await requireAnyPermission(
		request,
		[
			"treasury:breakdown:read",
		],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const categoryParam = url.searchParams.get("category");
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
	let transactions = allTransactionsForYear.filter(
		(t) =>
			!t.reimbursementStatus ||
			t.reimbursementStatus === "not_requested" ||
			t.reimbursementStatus === "approved",
	);

	// Filter by category if specified
	if (categoryParam && categoryParam !== "all") {
		transactions = transactions.filter((t) => t.category === categoryParam);
	}

	// Filter by type if specified
	if (typeParam && typeParam !== "all") {
		transactions = transactions.filter((t) => t.type === typeParam);
	}

	// Calculate totals from transactions before category/type filtering (for summary cards)
	const transactionsForTotals = allTransactionsForYear.filter(
		(t) =>
			!t.reimbursementStatus ||
			t.reimbursementStatus === "not_requested" ||
			t.reimbursementStatus === "approved",
	);

	const totalExpenses = transactionsForTotals
		.filter((t) => t.type === "expense")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const totalIncome = transactionsForTotals
		.filter((t) => t.type === "income")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const balance = totalIncome - totalExpenses;

	// Sort by date descending
	const sortedTransactions = transactions.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	// Get all years with transactions for navigation
	const allTransactions = await db.getAllTransactions();
	const years = [...new Set(allTransactions.map((t) => t.year))].sort(
		(a, b) => b - a,
	);

	// Get unique categories for filter (excluding null/empty)
	const categories = [...new Set(allTransactionsForYear.map((t) => t.category).filter((c): c is string => Boolean(c)))];

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

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		year,
		transactions: sortedTransactions,
		totalExpenses,
		totalIncome,
		balance,
		years,
		categories,
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
					t("treasury.breakdown.import_success", { count: result.imported })
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
		years,
		categories,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const { hasPermission, user } = useUser();
	const canEditGeneral = hasPermission("treasury:transactions:update");
	const canEditSelf = hasPermission("treasury:transactions:update-self");
	const canExport = hasPermission("treasury:export");
	const canImport = hasPermission("treasury:import");

	// Helper to check if user can edit a specific transaction
	const canViewTransaction = (transaction: Transaction) =>
		hasPermission("treasury:transactions:read") ||
		(hasPermission("treasury:transactions:read-self") &&
			transaction.createdBy &&
			user?.userId === transaction.createdBy);
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

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options: years.length > 0 ? years.map(String) : [String(new Date().getFullYear())],
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

	// Canonical treasury column order: Date, Name/Description, Category, Type, Status, Created by, [route-specific], Amount
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
			key: "category",
			header: t("treasury.breakdown.category"),
			cell: (row: Transaction) => row.category || "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "status",
			header: t("treasury.breakdown.status"),
			cell: (row: Transaction) => (
				<TreasuryStatusPill
					value={row.status}
					variantMap={TREASURY_TRANSACTION_STATUS_VARIANTS}
					label={t(
						`treasury.breakdown.actions.edit.statuses.${row.status}`,
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
				`${TREASURY_TABLE_STYLES.AMOUNT_CELL} ${row.type === "expense"
					? TREASURY_TABLE_STYLES.AMOUNT_EXPENSE
					: TREASURY_TABLE_STYLES.AMOUNT_INCOME
				}`,
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
				<div className="space-y-6">
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
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
