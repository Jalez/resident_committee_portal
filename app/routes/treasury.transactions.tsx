import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { useUser } from "~/contexts/user-context";
import { useLanguage } from "~/contexts/language-context";
import { getDatabase, type Transaction } from "~/db";
import { requirePermission } from "~/lib/auth.server";
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
		transactions = allTransactions.filter((t) => t.status === statusParam);
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

	return {
		siteConfig: SITE_CONFIG,
		year,
		transactions: sortedTransactions,
		totalExpenses,
		totalIncome,
		years,
		statuses,
		currentStatus: statusParam || "all",
		totalCount: allTransactions.length,
	};
}

export default function TreasuryTransactions({
	loaderData,
}: Route.ComponentProps) {
	const { year, transactions, totalExpenses, totalIncome, years, statuses, currentStatus, totalCount } =
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
	const { isInfoReel } = useLanguage();

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

	const handleYearChange = (newYear: number) => {
		setSearchParams((prev) => {
			prev.set("year", String(newYear));
			return prev;
		});
	};

	const handleStatusChange = (newStatus: string) => {
		setSearchParams((prev) => {
			if (newStatus === "all") {
				prev.delete("status");
			} else {
				prev.set("status", newStatus);
			}
			return prev;
		});
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-4xl mx-auto px-4">
				{/* Header */}
				<div className="mb-8 flex flex-wrap items-start justify-between gap-4">
					<div>
						<Link
							to="/treasury"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-2"
						>
							<span className="material-symbols-outlined text-base">
								arrow_back
							</span>
							{t("treasury.transactions.back")}
						</Link>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("treasury.transactions.title")} {year}
						</h1>
						<p className="text-lg text-gray-500">
							{isInfoReel
								? t("treasury.transactions.title", { lng: "en" })
								: t("treasury.transactions.title")}{" "}
							{year}
						</p>
					</div>

					<div className="flex items-center gap-4">
						{/* Year navigation */}
						{years.length > 0 && (
							<div className="flex gap-2">
								{years.map((y: number) => (
									<Button
										key={y}
										variant={y === year ? "default" : "secondary"}
										onClick={() => handleYearChange(y)}
										className="font-bold rounded-xl"
									>
										{y}
									</Button>
								))}
							</div>
						)}

						{/* Add new transaction button */}
						{canWrite && (
							<Link
								to="/treasury/transactions/new"
								className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
								title={t("treasury.transactions.new")}
							>
								<span className="material-symbols-outlined text-xl">add</span>
							</Link>
						)}
					</div>
				</div>

				{/* Summary cards */}
				<div className="grid grid-cols-2 gap-4 mb-8">
					<div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
						<p className="text-xs font-bold uppercase text-gray-500 mb-1">
							{t("treasury.transactions.total_income")}
						</p>
						<p className="text-xl font-black text-green-600 dark:text-green-400">
							+{formatCurrency(totalIncome)}
						</p>
					</div>
					<div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
						<p className="text-xs font-bold uppercase text-gray-500 mb-1">
							{t("treasury.transactions.total_expenses")}
						</p>
						<p className="text-xl font-black text-red-600 dark:text-red-400">
							-{formatCurrency(totalExpenses)}
						</p>
					</div>
				</div>

				{/* Status filter */}
				<div className="mb-4 flex flex-wrap gap-2">
					<Button
						variant={currentStatus === "all" ? "default" : "secondary"}
						onClick={() => handleStatusChange("all")}
						className="font-bold rounded-xl"
					>
						{t("treasury.transactions.all")} ({totalCount})
					</Button>
					{statuses.map((status: string) => (
						<Button
							key={status}
							variant={currentStatus === status ? "default" : "secondary"}
							onClick={() => handleStatusChange(status)}
							className="font-bold rounded-xl"
						>
							{t(`treasury.breakdown.edit.statuses.${status}`, { defaultValue: status })}
						</Button>
					))}
				</div>

				{/* Transactions table */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					<div className="p-4 border-b border-gray-200 dark:border-gray-700">
						<h2 className="text-lg font-bold text-gray-900 dark:text-white">
							{t("treasury.breakdown.transactions")} ({transactions.length})
						</h2>
					</div>

					{transactions.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							{t("treasury.breakdown.no_transactions")}
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("treasury.breakdown.date")}</TableHead>
									<TableHead>{t("treasury.breakdown.description")}</TableHead>
									<TableHead>{t("treasury.breakdown.category")}</TableHead>
									<TableHead>{t("treasury.transactions.status")}</TableHead>
									<TableHead>{t("treasury.transactions.reimbursement_status")}</TableHead>
									<TableHead className="text-right">
										{t("treasury.breakdown.amount")}
									</TableHead>
									{(canEditGeneral || canEditSelf) && <TableHead className="w-16"></TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{transactions.map((transaction: Transaction) => (
									<TableRow key={transaction.id}>
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
							</TableBody>
						</Table>
					)}
				</div>
			</div>
		</PageWrapper>
	);
}
