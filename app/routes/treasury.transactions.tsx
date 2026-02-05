import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
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
	// Require transactions:read permission - throw 404 to hide route
	try {
		await requirePermission(request, "transactions:read", getDatabase);
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

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
	const allTransactions = await db.getTransactionsByYear(year);

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
		systemLanguages,
	};
}

export default function TreasuryTransactions({
	loaderData,
}: Route.ComponentProps) {
	const { transactions, years, statuses, categories, systemLanguages } =
		loaderData;
	const [searchParams, setSearchParams] = useSearchParams();
	const { hasPermission, user } = useUser();
	const canEditGeneral = hasPermission("transactions:update");
	const canEditSelf = hasPermission("transactions:update-self");
	const canWrite = hasPermission("transactions:write");
	
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
									<TableHead>{t("treasury.transactions.type")}</TableHead>
									<TableHead>{t("treasury.transactions.status")}</TableHead>
									<TableHead>{t("treasury.transactions.reimbursement_status")}</TableHead>
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
													transaction.type === "income"
														? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
														: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
												}`}
											>
												{t(`treasury.types.${transaction.type}`, {
													defaultValue: transaction.type,
												})}
											</span>
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
													`treasury.breakdown.edit.statuses.${transaction.status}`,
													{ defaultValue: transaction.status },
												)}
											</span>
										</TableCell>
										<TableCell>
											{transaction.reimbursementStatus && transaction.reimbursementStatus !== "not_requested" ? (
												<span
													className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
														transaction.reimbursementStatus === "approved"
															? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
															: transaction.reimbursementStatus === "requested"
																? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
																: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
													}`}
												>
													{t(
														`treasury.breakdown.edit.reimbursement_statuses.${transaction.reimbursementStatus}`,
														{ defaultValue: transaction.reimbursementStatus },
													)}
												</span>
											) : (
												<span className="text-gray-400">—</span>
											)}
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
									labelColSpan={7}
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
