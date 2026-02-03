import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { MobileActionMenuWithItems } from "~/components/mobile-action-menu";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { useLanguage } from "~/contexts/language-context";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury";

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

	// Calculate totals: Balance = Income - Expenses
	const expenses = transactions
		.filter((t) => t.type === "expense")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const income = transactions
		.filter((t) => t.type === "income")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const balance = income - expenses;

	// Get open reservations for the selected year to calculate reserved amount
	const openReservations = await db.getOpenFundReservationsByYear(selectedYear);
	let totalReserved = 0;
	for (const reservation of openReservations) {
		const usedAmount = await db.getReservationUsedAmount(reservation.id);
		const remainingInReservation = Number.parseFloat(reservation.amount) - usedAmount;
		totalReserved += remainingInReservation;
	}
	const available = balance - totalReserved;

	return {
		siteConfig: SITE_CONFIG,
		selectedYear,
		expenses,
		income,
		balance,
		reserved: totalReserved,
		available,
		years: contextYears.length > 0 ? contextYears : [currentRealYear],
		transactionCount: transactions.length,
		languages,
	};
}

export default function Treasury({ loaderData }: Route.ComponentProps) {
	const {
		selectedYear,
		expenses,
		income,
		balance,
		reserved,
		available,
		years,
		transactionCount,
		languages,
	} = loaderData;
	const { hasPermission } = useUser();
	const canReadBreakdown = hasPermission("treasury_breakdown:read");
	const canReadTransactions = hasPermission("transactions:read");

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
			label: t("treasury.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options: years.map(String),
		},
	];

	// QR Panel - only show if user can access breakdown
	const RightContent = canReadBreakdown ? (
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

	// Build action items array based on permissions
	const actionItems = [
		...(canReadBreakdown
			? [
				{
					href: `/treasury/breakdown?year=${selectedYear}`,
					icon: "table_chart",
					labelPrimary: t("treasury.actions.breakdown", { lng: languages.primary }),
					labelSecondary: t("treasury.actions.breakdown", {
						lng: languages.secondary,
					}),
				},
			]
			: []),
		...(canReadTransactions
			? [
				{
					href: `/treasury/transactions?year=${selectedYear}`,
					icon: "list_alt",
					labelPrimary: t("treasury.actions.transactions", { lng: languages.primary }),
					labelSecondary: t("treasury.actions.transactions", {
						lng: languages.secondary,
					}),
				},
			]
			: []),
		...(hasPermission("reimbursements:read")
			? [
				{
					href: "/treasury/reimbursements",
					icon: "receipt_long",
					labelPrimary: t("treasury.actions.reimbursements", {
						lng: languages.primary,
					}),
					labelSecondary: t("treasury.actions.reimbursements", {
						lng: languages.secondary,
					}),
				},
			]
			: []),
		...(hasPermission("reservations:read")
			? [
				{
					href: `/treasury/reservations?year=${selectedYear}`,
					icon: "savings",
					labelPrimary: t("treasury.actions.reservations", {
						lng: languages.primary,
					}),
					labelSecondary: t("treasury.actions.reservations", {
						lng: languages.secondary,
					}),
				},
			]
			: []),
	];

	// Footer with breakdown link and add button for staff
	const FooterContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
			<MobileActionMenuWithItems items={actionItems} />
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
							<div>
								<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
									{t("treasury.balance")}
								</p>
								<p
									className={`text-5xl lg:text-7xl font-black tracking-tighter ${balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
								>
									{formatCurrency(balance)}
								</p>
							</div>

							{/* Reserved / Available split - only show if there's reserved amount */}
							{reserved > 0 && (
								<div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
									<div>
										<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
											{t("treasury.reserved")}
										</p>
										<p className="text-2xl lg:text-3xl font-bold text-amber-600 dark:text-amber-400">
											{formatCurrency(reserved)}
										</p>
									</div>
									<div>
										<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
											{t("treasury.available")}
										</p>
										<p className={`text-2xl lg:text-3xl font-bold ${available >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
											{formatCurrency(available)}
										</p>
									</div>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
										{t("treasury.income")}
									</p>
									<p className="text-2xl lg:text-3xl font-bold text-green-600 dark:text-green-400">
										+{formatCurrency(income)}
									</p>
								</div>
								<div>
									<p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
										{t("treasury.expenses")}
									</p>
									<p className="text-2xl lg:text-3xl font-bold text-red-600 dark:text-red-400">
										-{formatCurrency(expenses)}
									</p>
								</div>
							</div>

							<div className="inline-block bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
								<p className="text-sm font-medium text-gray-600 dark:text-gray-400">
									{t("treasury.transactions_count", {
										count: transactionCount,
									})}
									{canReadBreakdown && (
										<>
											{" "}—
											<Link
												to={`/treasury/breakdown?year=${selectedYear}`}
												className="text-primary hover:underline ml-1"
											>
												{t("treasury.view_breakdown")}
											</Link>
										</>
									)}
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
