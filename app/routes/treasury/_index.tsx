import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import {
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { useLanguage } from "~/contexts/language-context";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const year = data?.selectedYear ? ` ${data.selectedYear}` : "";
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Rahasto${year} / Treasury${year}`,
		},
		{
			name: "description",
			content: "Toimikunnan rahasto / Tenant Committee Treasury",
		},
	];
}

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

	const canRead = permissions.some((p) => p === "treasury:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");

	// Get all transactions to populate dropdown
	const allTransactions = await db.getAllTransactions();
	const transactionYears = allTransactions.map((t) => t.year);

	// Unique years sorted descending
	const contextYears = [...new Set(transactionYears)].sort((a, b) => b - a);

	// Default to current year
	const currentRealYear = new Date().getFullYear();
	const selectedYear = yearParam ? parseInt(yearParam, 10) : currentRealYear;

	// Get selected year's transactions
	const allYearTransactions = await db.getTransactionsByYear(selectedYear);

	// Filter out pending/declined reimbursements - they shouldn't affect the budget yet
	// Only include transactions that are either:
	// - not_requested: normal transaction, no reimbursement needed
	// - approved: reimbursement was approved and will be paid
	// Exclude:
	// - requested: waiting for approval
	// - declined: rejected, won't be paid
	const transactions = allYearTransactions.filter(
		(t) =>
			!t.reimbursementStatus ||
			t.reimbursementStatus === "not_requested" ||
			t.reimbursementStatus === "approved",
	);

	// Get all transaction IDs that are linked to budgets using entity relationships
	const allBudgets = await db.getFundBudgetsByYear(selectedYear);
	const budgetLinkedTransactionIds = new Set<string>();
	for (const budget of allBudgets) {
		const relationships = await loadRelationshipsForEntity(
			db,
			"budget",
			budget.id,
			["transaction"],
		);
		const linkedTransactions = relationships.transaction?.linked || [];
		for (const transaction of linkedTransactions) {
			budgetLinkedTransactionIds.add((transaction as { id: string }).id);
		}
	}

	// Calculate totals: Balance = Income - Expenses (including ALL expenses)
	// Budget-linked expenses reduce the balance AND reduce the reserved amount
	const allExpenses = transactions
		.filter((t) => t.type === "expense")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	// Separate budget-linked transactions from unbudgeted transactions
	const budgetedTransactions = transactions
		.filter((t) => budgetLinkedTransactionIds.has(t.id))
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const budgetLinkedExpenses = transactions
		.filter((t) => t.type === "expense" && budgetLinkedTransactionIds.has(t.id))
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const unbudgetedExpenses = allExpenses - budgetLinkedExpenses;

	const income = transactions
		.filter((t) => t.type === "income")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const balance = income - allExpenses;

	// Get open budgets for the selected year to calculate reserved amount
	const openBudgets = await db.getOpenFundBudgetsByYear(selectedYear);
	let totalReserved = 0;
	for (const budget of openBudgets) {
		const usedAmount = await db.getBudgetUsedAmount(budget.id);
		const remainingInBudget = Number.parseFloat(budget.amount) - usedAmount;
		// Only count positive remaining amounts (if budget is overspent, don't subtract from reserved)
		totalReserved += Math.max(0, remainingInBudget);
	}
	const available = balance - totalReserved;

	return {
		siteConfig: SITE_CONFIG,
		selectedYear,
		unbudgeted_transactions: unbudgetedExpenses,
		budgeted_transactions: budgetedTransactions,
		budgetLinkedExpenses,
		income,
		balance,
		budget_costs: totalReserved,
		available,
		years: contextYears.length > 0 ? contextYears : [currentRealYear],
		transactionCount: transactions.length,
		languages,
	};
}

export default function Treasury({ loaderData }: Route.ComponentProps) {
	const {
		selectedYear,
		unbudgeted_transactions,
		budgeted_transactions,
		income,
		balance,
		budget_costs,
		available,
		years,
		transactionCount,
		languages,
	} = loaderData;
	const { hasPermission } = useUser();
	const canReadBreakdown = hasPermission("treasury:breakdown:read");

	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	const { t } = useTranslation();
	const { isInfoReel } = useLanguage();
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		const success = searchParams.get("success");
		if (!success) return;
		if (success === "transaction_created") {
			toast.success(t("treasury.success.transaction_created"));
		} else {
			toast.success(success);
		}
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("success");
		setSearchParams(nextParams, { replace: true });
	}, [searchParams, setSearchParams, t]);

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options: years.map(String),
		},
	];

	// QR Panel in info reel mode should always be visible.
	const RightContent = (canReadBreakdown || isInfoReel) ? (
		<QRPanel
			qrUrl={`/treasury/breakdown?year=${selectedYear}`}
			title={
				<h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
					{t("treasury.view_breakdown")} <br />
					{isInfoReel && (
						<span className="text-lg text-gray-400 font-bold">
							{t("treasury.view_breakdown", { lng: "en" })}
						</span>
					)}
				</h2>
			}
		/>
	) : null;

	const FooterContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
		</div>
	);

	return (
		<PageWrapper>
			<SplitLayout
				right={RightContent}
				footer={FooterContent}
				header={{
					primary: t("treasury.title", {
						year: selectedYear,
						lng: languages.primary,
					}),
					secondary: t("treasury.title", {
						year: selectedYear,
						lng: languages.secondary,
					}),
				}}
			>
				<ContentArea className="space-y-8">
					{transactionCount > 0 ? (
						<>
							{/* Available funds - most important, shown prominently */}
							<div>
								<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
									{t("treasury.available")}
								</p>
								<p
									className={`text-5xl lg:text-7xl font-black tracking-tighter ${available >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}
								>
									{formatCurrency(available)}
								</p>
							</div>

							{/* Income */}
							<div>
								<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
									{t("treasury.income")}
								</p>
								<p className="text-2xl lg:text-3xl font-bold text-green-600 dark:text-green-400">
									+{formatCurrency(income)}
								</p>
							</div>

							{/* Expenses: Budgeted and Unbudgeted transactions side by side */}
							<div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
								<div>
									<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
										{t("treasury.unbudgeted_transactions")}
									</p>
									<p className="text-2xl lg:text-3xl font-bold text-red-600 dark:text-red-400">
										-{formatCurrency(unbudgeted_transactions)}
									</p>
								</div>
								{budgeted_transactions > 0 ? (
									<div>
										<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
											{t("treasury.budgeted_transactions")}
										</p>
										<p className="text-2xl lg:text-3xl font-bold text-amber-600 dark:text-amber-400">
											-{formatCurrency(budgeted_transactions)}
										</p>
									</div>
								) : (
									<div />
								)}
							</div>

							{/* Balance and Budget costs side by side */}
							<div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
								<div>
									<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
										{t("treasury.balance")}
									</p>
									<p
										className={`text-2xl lg:text-3xl font-bold ${balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
									>
										{formatCurrency(balance)}
									</p>
								</div>
								{budget_costs > 0 ? (
									<div>
										<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
											{t("treasury.budget_costs")}
										</p>
										<p className="text-2xl lg:text-3xl font-bold text-amber-600 dark:text-amber-400">
											{formatCurrency(budget_costs)}
										</p>
									</div>
								) : (
									<div />
								)}
							</div>

							<div className="inline-block bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
								<p className="text-sm font-medium text-gray-600 dark:text-gray-400">
									{t("treasury.transactions_count", {
										count: transactionCount,
									})}
								</p>
							</div>
						</>
					) : (
						<div className="text-center py-12">
							<span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
								account_balance_wallet
							</span>
							<p className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">
								{t("treasury.no_transactions")}
							</p>
							<p className="text-gray-400 dark:text-gray-500">
								{isInfoReel ? (
									<>
										{t("treasury.no_transactions_desc", {
											year: selectedYear,
											lng: "fi",
										})}
										<br />
										{t("treasury.no_transactions_desc", {
											year: selectedYear,
											lng: "en",
										})}
									</>
								) : (
									t("treasury.no_transactions_desc", { year: selectedYear })
								)}
							</p>
						</div>
					)}
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
