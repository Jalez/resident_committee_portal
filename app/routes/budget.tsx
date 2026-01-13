import type { Route } from "./+types/budget";
import { Link, useRouteLoaderData } from "react-router";
import { PageWrapper, SplitLayout, QRPanel, ActionButton, ContentArea } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Budjetti / Budget` },
        { name: "description", content: "Toimikunnan budjetti / Tenant Committee Budget" },
    ];
}

export async function loader({ }: Route.LoaderArgs) {
    const db = getDatabase();
    const currentYear = new Date().getFullYear();

    // Get current year's budget
    const budget = await db.getBudgetByYear(currentYear);
    const transactions = await db.getTransactionsByYear(currentYear);

    // Calculate totals
    const expenses = transactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const income = transactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const allocation = budget ? parseFloat(budget.allocation) : 0;
    const remaining = allocation + income - expenses;

    // Get all years with budgets
    const allBudgets = await db.getAllBudgets();
    const years = allBudgets.map(b => b.year).sort((a, b) => b - a);

    return {
        siteConfig: SITE_CONFIG,
        currentYear,
        allocation,
        expenses,
        income,
        remaining,
        hasBudget: !!budget,
        years,
        transactionCount: transactions.length,
    };
}

export default function Budget({ loaderData }: Route.ComponentProps) {
    const { currentYear, allocation, expenses, income, remaining, hasBudget, years, transactionCount } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const isAdmin = rootData?.user?.role === "admin";

    const formatCurrency = (value: number) => {
        return value.toFixed(2).replace(".", ",") + " €";
    };

    // QR Panel
    const RightContent = (
        <QRPanel
            qrUrl={`/budget/breakdown?year=${currentYear}`}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    Katso erittely <br />
                    <span className="text-lg text-gray-400 font-bold">See Breakdown</span>
                </h2>
            }
        />
    );

    // Footer with breakdown link
    const FooterContent = (
        <div className="flex items-center gap-2">
            <ActionButton
                href={`/budget/breakdown`}
                icon="table_chart"
                labelFi="Erittely"
                labelEn="Breakdown"
            />
            {isAdmin && (
                <ActionButton
                    href="/admin/budget"
                    icon="settings"
                    labelFi="Hallinta"
                    labelEn="Manage"
                />
            )}
        </div>
    );

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                footer={FooterContent}
                header={{ finnish: "Budjetti", english: "Budget" }}
            >
                <ContentArea className="space-y-8">
                    {!hasBudget ? (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
                            <p className="text-yellow-800 dark:text-yellow-200">
                                Vuodelle {currentYear} ei ole vielä määritetty budjettia.
                                <br />
                                No budget has been set for {currentYear} yet.
                            </p>
                            {isAdmin && (
                                <Link
                                    to="/admin/budget"
                                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    Luo budjetti / Create Budget
                                </Link>
                            )}
                        </div>
                    ) : (
                        <>
                            <div>
                                <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    Jäljellä oleva budjetti / Remaining Budget
                                </p>
                                <p className={`text-5xl lg:text-7xl font-black tracking-tighter ${remaining >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                    {formatCurrency(remaining)}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Kokonaisbudjetti / Total
                                    </p>
                                    <p className="text-2xl lg:text-3xl font-bold text-gray-700 dark:text-gray-300">
                                        {formatCurrency(allocation)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Kulut / Expenses
                                    </p>
                                    <p className="text-2xl lg:text-3xl font-bold text-red-600 dark:text-red-400">
                                        -{formatCurrency(expenses)}
                                    </p>
                                </div>
                            </div>

                            {income > 0 && (
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Tulot / Income
                                    </p>
                                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                                        +{formatCurrency(income)}
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    <div className="inline-block bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            {transactionCount} tapahtumaa / transactions —
                            <Link to={`/budget/breakdown?year=${currentYear}`} className="text-primary hover:underline ml-1">
                                Katso erittely / See breakdown
                            </Link>
                        </p>
                    </div>

                    {/* Year selector */}
                    {years.length > 1 && (
                        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <span className="text-sm text-gray-500 mr-2">Muut vuodet / Other years:</span>
                            {years.filter(y => y !== currentYear).map(year => (
                                <Link
                                    key={year}
                                    to={`/budget/breakdown?year=${year}`}
                                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-bold hover:bg-primary/20 hover:text-primary transition-colors"
                                >
                                    {year}
                                </Link>
                            ))}
                        </div>
                    )}
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
