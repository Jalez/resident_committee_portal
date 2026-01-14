import type { Route } from "./+types/treasury";
import { Link, useRouteLoaderData } from "react-router";
import { PageWrapper, SplitLayout, QRPanel, ActionButton, ContentArea } from "~/components/layout/page-layout";
import { SearchMenu, type SearchField } from "~/components/search-menu";
import { getDatabase } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: Route.MetaArgs) {
    const year = data?.selectedYear ? ` ${data.selectedYear}` : "";
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Rahasto${year} / Treasury${year}` },
        { name: "description", content: "Toimikunnan rahasto / Tenant Committee Treasury" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const db = getDatabase();
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");

    // Get all transactions to populate dropdown
    const allTransactions = await db.getAllTransactions();
    const transactionYears = allTransactions.map(t => t.year);

    // Unique years sorted descending
    const contextYears = [...new Set(transactionYears)].sort((a, b) => b - a);

    // Default to current year
    const currentRealYear = new Date().getFullYear();
    const selectedYear = yearParam ? parseInt(yearParam) : currentRealYear;

    // Get selected year's transactions
    const transactions = await db.getTransactionsByYear(selectedYear);

    // Calculate totals: Balance = Income - Expenses
    const expenses = transactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const income = transactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const balance = income - expenses;

    return {
        siteConfig: SITE_CONFIG,
        selectedYear,
        expenses,
        income,
        balance,
        years: contextYears.length > 0 ? contextYears : [currentRealYear],
        transactionCount: transactions.length,
    };
}

export default function Treasury({ loaderData }: Route.ComponentProps) {
    const { selectedYear, expenses, income, balance, years, transactionCount } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const isStaff = rootData?.user?.role === "admin" || rootData?.user?.role === "board_member";

    const formatCurrency = (value: number) => {
        return value.toFixed(2).replace(".", ",") + " €";
    };

    // Configure search fields
    const searchFields: SearchField[] = [
        {
            name: "year",
            label: "Vuosi / Year",
            type: "select",
            placeholder: "Valitse vuosi...",
            options: years.map(String),
        },
    ];

    // QR Panel
    const RightContent = (
        <QRPanel
            qrUrl={`/treasury/breakdown?year=${selectedYear}`}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    Katso erittely <br />
                    <span className="text-lg text-gray-400 font-bold">See Breakdown</span>
                </h2>
            }
        />
    );

    // Footer with breakdown link and add button for staff
    const FooterContent = (
        <div className="flex items-center gap-2">
            <SearchMenu fields={searchFields} />
            <ActionButton
                href={`/treasury/breakdown?year=${selectedYear}`}
                icon="table_chart"
                labelFi="Erittely"
                labelEn="Breakdown"
                external={false}
            />
            {isStaff && (
                <ActionButton
                    href="/treasury/new"
                    icon="add"
                    labelFi="Lisää"
                    labelEn="Add"
                    external={false}
                />
            )}
        </div>
    );

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                footer={FooterContent}
                header={{
                    finnish: `Rahasto ${selectedYear}`,
                    english: `Treasury ${selectedYear}`
                }}
            >
                <ContentArea className="space-y-8">
                    {transactionCount > 0 ? (
                        <>
                            <div>
                                <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    Saldo / Balance
                                </p>
                                <p className={`text-5xl lg:text-7xl font-black tracking-tighter ${balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                    {formatCurrency(balance)}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Tulot / Income
                                    </p>
                                    <p className="text-2xl lg:text-3xl font-bold text-green-600 dark:text-green-400">
                                        +{formatCurrency(income)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Menot / Expenses
                                    </p>
                                    <p className="text-2xl lg:text-3xl font-bold text-red-600 dark:text-red-400">
                                        -{formatCurrency(expenses)}
                                    </p>
                                </div>
                            </div>

                            <div className="inline-block bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                    {transactionCount} tapahtumaa / transactions —
                                    <Link to={`/treasury/breakdown?year=${selectedYear}`} className="text-primary hover:underline ml-1">
                                        Katso erittely / See breakdown
                                    </Link>
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">account_balance_wallet</span>
                            <p className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">
                                Ei tapahtumia / No transactions
                            </p>
                            <p className="text-gray-400 dark:text-gray-500 mb-4">
                                Vuodelle {selectedYear} ei ole vielä kirjattu tapahtumia.
                                <br />
                                No transactions recorded for {selectedYear} yet.
                            </p>
                            {isStaff && (
                                <Link
                                    to="/treasury/new"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    Lisää tapahtuma / Add Transaction
                                </Link>
                            )}
                        </div>
                    )}
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
