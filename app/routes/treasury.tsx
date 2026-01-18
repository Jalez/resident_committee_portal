import type { Route } from "./+types/treasury";
import { Link } from "react-router";
import { PageWrapper, SplitLayout, QRPanel, ActionButton, ContentArea } from "~/components/layout/page-layout";
import { SearchMenu, type SearchField } from "~/components/search-menu";
import { MobileActionMenuWithItems } from "~/components/mobile-action-menu";
import { getDatabase } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { useUser } from "~/contexts/user-context";
import { getAuthenticatedUser, getGuestPermissions } from "~/lib/auth.server";
import { useLanguage } from "~/contexts/language-context";

export function meta({ data }: Route.MetaArgs) {
    const year = data?.selectedYear ? ` ${data.selectedYear}` : "";
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Rahasto${year} / Treasury${year}` },
        { name: "description", content: "Toimikunnan rahasto / Tenant Committee Treasury" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    // Check permission (works for both logged-in users and guests)
    const authUser = await getAuthenticatedUser(request, getDatabase);
    const permissions = authUser
        ? authUser.permissions
        : await getGuestPermissions(() => getDatabase());

    const canRead = permissions.some(p => p === "treasury:read" || p === "*");
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

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
    const allYearTransactions = await db.getTransactionsByYear(selectedYear);

    // Filter out pending/declined reimbursements - they shouldn't affect the budget yet
    // Only include transactions that are either:
    // - not_requested: normal transaction, no reimbursement needed
    // - approved: reimbursement was approved and will be paid
    // Exclude:
    // - requested: waiting for approval
    // - declined: rejected, won't be paid
    const transactions = allYearTransactions.filter(t =>
        !t.reimbursementStatus ||
        t.reimbursementStatus === "not_requested" ||
        t.reimbursementStatus === "approved"
    );

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
    const { hasPermission } = useUser();
    const canWrite = hasPermission("treasury:write");

    const formatCurrency = (value: number) => {
        return value.toFixed(2).replace(".", ",") + " €";
    };

    const { language, isInfoReel } = useLanguage();
    const t = (fi: string, en: string) => (language === "fi" || isInfoReel) ? fi : en;

    // Configure search fields
    const searchFields: SearchField[] = [
        {
            name: "year",
            label: t("Vuosi", "Year"),
            type: "select",
            placeholder: t("Valitse vuosi...", "Select year..."),
            options: years.map(String),
        },
    ];

    // QR Panel
    const RightContent = (
        <QRPanel
            qrUrl={`/treasury/breakdown?year=${selectedYear}`}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    {t("Katso erittely", "See Breakdown")} <br />
                    {isInfoReel && <span className="text-lg text-gray-400 font-bold">See Breakdown</span>}
                </h2>
            }
        />
    );

    // Build action items array based on permissions
    const actionItems = [
        {
            href: `/treasury/breakdown?year=${selectedYear}`,
            icon: "table_chart",
            labelFi: "Erittely",
            labelEn: "Breakdown",
        },
        ...(hasPermission("reimbursements:read") ? [{
            href: "/treasury/reimbursements",
            icon: "receipt_long",
            labelFi: "Kulukorvaukset",
            labelEn: "Reimbursements",
        }] : []),
        ...(canWrite ? [{
            href: "/treasury/new",
            icon: "add",
            labelFi: "Lisää",
            labelEn: "Add",
        }] : []),
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
                    finnish: `Rahasto ${selectedYear}`,
                    english: `Treasury ${selectedYear}`
                }}
            >
                <ContentArea className="space-y-8">
                    {transactionCount > 0 ? (
                        <>
                            <div>
                                <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                    {t("Saldo", "Balance")}
                                </p>
                                <p className={`text-5xl lg:text-7xl font-black tracking-tighter ${balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                    {formatCurrency(balance)}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        {t("Tulot", "Income")}
                                    </p>
                                    <p className="text-2xl lg:text-3xl font-bold text-green-600 dark:text-green-400">
                                        +{formatCurrency(income)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        {t("Menot", "Expenses")}
                                    </p>
                                    <p className="text-2xl lg:text-3xl font-bold text-red-600 dark:text-red-400">
                                        -{formatCurrency(expenses)}
                                    </p>
                                </div>
                            </div>

                            <div className="inline-block bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                    {transactionCount} {t("tapahtumaa", "transactions")} —
                                    <Link to={`/treasury/breakdown?year=${selectedYear}`} className="text-primary hover:underline ml-1">
                                        {t("Katso erittely", "See breakdown")}
                                    </Link>
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">account_balance_wallet</span>
                            <p className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">
                                {t("Ei tapahtumia", "No transactions")}
                            </p>
                            <p className="text-gray-400 dark:text-gray-500 mb-4">
                                {language === "fi" || isInfoReel ? `Vuodelle ${selectedYear} ei ole vielä kirjattu tapahtumia.` : `No transactions recorded for ${selectedYear} yet.`}
                                {isInfoReel && <><br />No transactions recorded for {selectedYear} yet.</>}
                            </p>
                            {canWrite && (
                                <Link
                                    to="/treasury/new"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    {t("Lisää tapahtuma", "Add Transaction")}
                                </Link>
                            )}
                        </div>
                    )}
                </ContentArea>
            </SplitLayout>
        </PageWrapper >
    );
}
