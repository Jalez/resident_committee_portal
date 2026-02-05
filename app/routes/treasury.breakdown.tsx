import { Link } from "react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TableTotalsRow } from "~/components/treasury/table-totals-row";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { useUser } from "~/contexts/user-context";
import { getDatabase, type Transaction } from "~/db";
import { requirePermission } from "~/lib/auth.server";
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
	// Require treasury_breakdown:read permission - throw 404 to hide route
	try {
		await requirePermission(request, "treasury_breakdown:read", getDatabase);
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

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
	};
}

import { useTranslation } from "react-i18next";

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
	const { year, transactions, years, categories, systemLanguages } =
		loaderData;
	const { hasPermission, user } = useUser();
	const canEditGeneral = hasPermission("transactions:update");
	const canEditSelf = hasPermission("transactions:update-self");
	const canExport = hasPermission("treasury:export");
	const canImport = hasPermission("treasury:import");
	
	// Helper to check if user can edit a specific transaction
	const canEditTransaction = (transaction: Transaction) => {
		if (canEditGeneral) return true;
		if (canEditSelf && transaction.createdBy && user && transaction.createdBy === user.userId) {
			return true;
		}
		return false;
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
				{/* Transactions table */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					{transactions.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							{t("treasury.breakdown.no_transactions")}
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">#</TableHead>
									<TableHead>{t("treasury.breakdown.date")}</TableHead>
									<TableHead>{t("treasury.breakdown.description")}</TableHead>
									<TableHead>{t("treasury.breakdown.category")}</TableHead>
									<TableHead>{t("treasury.breakdown.status")}</TableHead>
									<TableHead className="text-right">
										{t("treasury.breakdown.amount")}
									</TableHead>
									{(canEditGeneral || canEditSelf) && <TableHead className="w-16"></TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{transactions.map((transaction: Transaction, index: number) => (
									<TableRow key={transaction.id}>
										<TableCell className="text-gray-500 dark:text-gray-400 text-sm font-mono">
											{index + 1}
										</TableCell>
										<TableCell className="font-mono text-sm">
											{formatDate(transaction.date)}
										</TableCell>
										<TableCell className="font-medium">
											{transaction.description}
										</TableCell>
										<TableCell className="text-gray-500">
											{transaction.category || "—"}
										</TableCell>
										<TableCell>
											<span
												className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
													transaction.status === "complete"
														? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
														: transaction.status === "pending"
															? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
															: transaction.status === "paused"
																? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
																: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
												}`}
											>
												{t(
													`treasury.breakdown.actions.edit.statuses.${transaction.status}`,
													{ defaultValue: transaction.status },
												)}
											</span>
										</TableCell>
										<TableCell
											className={`text-right font-bold ${
												transaction.type === "expense"
													? "text-red-600 dark:text-red-400"
													: "text-green-600 dark:text-green-400"
											}`}
										>
											{transaction.type === "expense" ? "-" : "+"}
											{formatCurrency(transaction.amount)}
										</TableCell>
										{canEditTransaction(transaction) && (
											<TableCell>
												<Link
													to={`/treasury/transactions/${transaction.id}/edit`}
													className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
												>
													<span className="material-symbols-outlined text-base">
														edit
													</span>
												</Link>
											</TableCell>
										)}
									</TableRow>
								))}
								<TableTotalsRow
									labelColSpan={5}
									columns={[
										{
											value: transactions.reduce((sum, t) => {
												const amount = parseFloat(t.amount);
												return sum + (t.type === "expense" ? -amount : amount);
											}, 0),
										},
									]}
									trailingColSpan={(canEditGeneral || canEditSelf) ? 1 : 0}
									formatCurrency={formatCurrency}
									rowCount={transactions.length}
								/>
							</TableBody>
						</Table>
					)}
				</div>

				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
