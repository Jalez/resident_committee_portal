import type { Route } from "./+types/treasury.breakdown";
import { Link, useSearchParams } from "react-router";
import { getDatabase, type Transaction } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { useUser } from "~/contexts/user-context";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Rahastoerittely / Treasury Breakdown` },
        { name: "description", content: "Toimikunnan rahastoerittely" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const db = getDatabase();
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const currentYear = new Date().getFullYear();
    const year = yearParam ? parseInt(yearParam) : currentYear;

    if (isNaN(year) || year < 2000 || year > 2100) {
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
    const transactions = allTransactionsForYear.filter(t =>
        !t.reimbursementStatus ||
        t.reimbursementStatus === "not_requested" ||
        t.reimbursementStatus === "approved"
    );

    // Sort by date descending
    const sortedTransactions = transactions.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Calculate totals: Balance = Income - Expenses
    const totalExpenses = transactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const totalIncome = transactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const balance = totalIncome - totalExpenses;

    // Get all years with transactions for navigation
    const allTransactions = await db.getAllTransactions();
    const years = [...new Set(allTransactions.map(t => t.year))].sort((a, b) => b - a);

    return {
        siteConfig: SITE_CONFIG,
        year,
        transactions: sortedTransactions,
        totalExpenses,
        totalIncome,
        balance,
        years,
    };
}

export default function TreasuryBreakdown({ loaderData }: Route.ComponentProps) {
    const { year, transactions, totalExpenses, totalIncome, balance, years } = loaderData;
    const [searchParams, setSearchParams] = useSearchParams();
    const { hasPermission } = useUser();
    const canEdit = hasPermission("treasury:edit");

    const formatCurrency = (value: number | string) => {
        const num = typeof value === "string" ? parseFloat(value) : value;
        return num.toFixed(2).replace(".", ",") + " €";
    };

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString("fi-FI");
    };

    const handleYearChange = (newYear: number) => {
        setSearchParams({ year: String(newYear) });
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
                            <span className="material-symbols-outlined text-base">arrow_back</span>
                            Takaisin / Back
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                            Rahastoerittely {year}
                        </h1>
                        <p className="text-lg text-gray-500">Treasury Breakdown {year}</p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Year navigation */}
                        {years.length > 0 && (
                            <div className="flex gap-2">
                                {years.map((y: number) => (
                                    <button
                                        key={y}
                                        onClick={() => handleYearChange(y)}
                                        className={`px-4 py-2 rounded-xl font-bold transition-colors ${y === year
                                            ? "bg-primary text-white"
                                            : "bg-gray-200 dark:bg-gray-700 hover:bg-primary/20 hover:text-primary"
                                            }`}
                                    >
                                        {y}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Export Button - only visible if user has permission */}
                        {hasPermission("treasury:read") && (
                            <a
                                href={`/api/treasury/export?year=${year}`}
                                download={`transactions-${year}.csv`}
                                className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                title="Lataa CSV / Export CSV"
                            >
                                <span className="material-symbols-outlined text-xl">download</span>
                            </a>
                        )}
                    </div>
                </div>

                {/* Summary cards - 3 columns now (no allocation) */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-bold uppercase text-gray-500 mb-1">Tulot / Income</p>
                        <p className="text-xl font-black text-green-600 dark:text-green-400">+{formatCurrency(totalIncome)}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-bold uppercase text-gray-500 mb-1">Menot / Expenses</p>
                        <p className="text-xl font-black text-red-600 dark:text-red-400">-{formatCurrency(totalExpenses)}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-bold uppercase text-gray-500 mb-1">Saldo / Balance</p>
                        <p className={`text-xl font-black ${balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {formatCurrency(balance)}
                        </p>
                    </div>
                </div>

                {/* Transactions table */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Tapahtumat / Transactions ({transactions.length})
                        </h2>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            Ei tapahtumia tälle vuodelle / No transactions for this year
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Päivä / Date</TableHead>
                                    <TableHead>Kuvaus / Description</TableHead>
                                    <TableHead>Kategoria / Category</TableHead>
                                    <TableHead>Tila / Status</TableHead>
                                    <TableHead className="text-right">Summa / Amount</TableHead>
                                    {canEdit && <TableHead className="w-16"></TableHead>}
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
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${transaction.status === "complete"
                                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                : transaction.status === "pending"
                                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                    : transaction.status === "paused"
                                                        ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                                                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                }`}>
                                                {transaction.status === "complete" ? "Valmis"
                                                    : transaction.status === "pending" ? "Odottaa"
                                                        : transaction.status === "paused" ? "Pysäytetty"
                                                            : "Hylätty"}
                                            </span>
                                        </TableCell>
                                        <TableCell className={`text-right font-bold ${transaction.type === "expense"
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-green-600 dark:text-green-400"
                                            }`}>
                                            {transaction.type === "expense" ? "-" : "+"}
                                            {formatCurrency(transaction.amount)}
                                        </TableCell>
                                        {canEdit && (
                                            <TableCell>
                                                <Link
                                                    to={`/treasury/breakdown/${transaction.id}/edit`}
                                                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                                >
                                                    <span className="material-symbols-outlined text-base">edit</span>
                                                </Link>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Note about transparency */}
                <p className="mt-6 text-sm text-gray-500 text-center">
                    Tämä on julkista tietoa / This is public information
                </p>
            </div>
        </PageWrapper>
    );
}
