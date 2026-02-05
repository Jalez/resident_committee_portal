import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import {
    getAnalyticsSheets,
    getSheetData,
    type AnalyticsSheet,
    type SheetData,
} from "~/lib/google.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type { Route } from "./+types/polls.analytics";
import { AnalyticsHeader } from "~/components/analytics/AnalyticsHeader";
import { AnalyticsChart } from "~/components/analytics/AnalyticsChart";
import { AnalyticsTable } from "~/components/analytics/AnalyticsTable";
import { Button } from "~/components/ui/button";

// ============================================================================
// Meta
// ============================================================================

export function meta({ data }: Route.MetaArgs) {
    const sheetName = data?.selectedSheet?.name;
    const title = sheetName
        ? `${data?.siteConfig?.name || "Portal"} - Analytics - ${sheetName}`
        : `${data?.siteConfig?.name || "Portal"} - Analytics`;
    return [
        { title },
        { name: "description", content: "View and analyze data from Google Sheets" },
    ];
}

// ============================================================================
// Loader
// ============================================================================

export async function loader({ request }: Route.LoaderArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    if (!authUser) {
        throw new Response("Not Found", { status: 404 });
    }

    const canRead = authUser.permissions.some(
        (p) => p === "forms:read" || p === "*",
    );
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

    const canExport = authUser.permissions.some(
        (p) => p === "forms:export" || p === "*",
    );

    // Fetch hidden questions setting
    const db = getDatabase();
    const hiddenQuestionsJson = await db.getSetting(SETTINGS_KEYS.ANALYTICS_HIDDEN_QUESTIONS);
    let hiddenQuestions: string[] = [];
    if (hiddenQuestionsJson) {
        try {
            hiddenQuestions = JSON.parse(hiddenQuestionsJson);
        } catch {
            // Invalid JSON, ignore
        }
    }

    const url = new URL(request.url);
    const sheetId = url.searchParams.get("sheetId");
    const forceRefresh = url.searchParams.get("refresh") === "true";
    const page = parseInt(url.searchParams.get("page") || "1", 10);

    // Get list of available sheets
    const sheets = await getAnalyticsSheets(undefined, forceRefresh);

    // If a sheet is selected, load its data
    let sheetData: SheetData | null = null;
    let selectedSheet: AnalyticsSheet | null = null;

    if (sheetId) {
        selectedSheet = sheets.find((s) => s.id === sheetId) || null;
        if (selectedSheet) {
            sheetData = await getSheetData(sheetId, forceRefresh);
        }
    }

    // Extract filter values from query params (col_0, col_1, etc.)
    const filters: Record<string, string> = {};
    if (sheetData) {
        for (const [index, header] of sheetData.headers.entries()) {
            const filterValue = url.searchParams.get(`col_${index}`);
            if (filterValue) {
                filters[header] = filterValue;
            }
        }
    }

    // Apply filters to data
    let filteredRows = sheetData?.rows || [];
    for (const [header, value] of Object.entries(filters)) {
        if (value) {
            const searchValues = value
                .split(",")
                .map((v) => v.trim().toLowerCase())
                .filter(Boolean);

            if (searchValues.length > 0) {
                filteredRows = filteredRows.filter((row) => {
                    const rowVal = (row[header] || "").toLowerCase();
                    return searchValues.some((sv) => rowVal.includes(sv));
                });
            }
        }
    }
    // Pagination
    const pageSize = 25;
    const totalCount = filteredRows.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);

    // Calculate unique values for each column (for filter dropdowns and charts)
    const columnUniqueValues: Record<string, string[]> = {};
    if (sheetData) {
        for (const header of sheetData.headers) {
            const uniqueVals = [
                ...new Set(
                    (sheetData.rows || [])
                        .map((row) => row[header])
                        .filter((v) => v?.trim()),
                ),
            ].sort();
            columnUniqueValues[header] = uniqueVals;
        }
    }

    // Get all rows for chart data (not paginated)
    const allFilteredRows = filteredRows;

    const systemLanguages = await getSystemLanguageDefaults();
    return {
        siteConfig: SITE_CONFIG,
        sheets,
        selectedSheet,
        sheetData: sheetData
            ? {
                headers: sheetData.headers,
                rows: paginatedRows,
                allRows: allFilteredRows,
                totalRows: totalCount,
            }
            : null,
        filters,
        columnUniqueValues,
        currentPage: page,
        pageSize,
        canExport,
        hiddenQuestions,
        systemLanguages,
    };
}

// ============================================================================
// Component
// ============================================================================

export default function PollsAnalytics({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const {
        sheets,
        selectedSheet,
        sheetData,
        filters,
        columnUniqueValues,
        currentPage,
        pageSize,
        canExport,
        hiddenQuestions,
        systemLanguages,
    } = loaderData;
    const [activeChartColumn, setActiveChartColumn] = useState<number>(0);

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: t("polls.analytics", { lng: systemLanguages.primary }),
                    secondary: t("polls.analytics", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
                }}
                footer={
                    <Button asChild variant="ghost" size="sm">
                        <Link to="/polls">
                            <span className="material-symbols-outlined text-base">arrow_back</span>
                        </Link>
                    </Button>
                }
            >
                <div className="flex flex-col gap-6">
                <p className="text-gray-500 dark:text-gray-400 text-sm -mt-6 mb-2">
                    {t("polls.analytics_description")}
                </p>

                {/* Sheet Selector & Actions */}
            <AnalyticsHeader
                sheets={sheets}
                selectedSheet={selectedSheet}
                canExport={canExport}
            />

            {/* Empty State */}
            {sheets.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600 mb-4">
                        folder_open
                    </span>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {t("polls.no_sheets_found")}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                        {t("polls.no_sheets_found_description")}
                    </p>
                </div>
            )}

            {/* No Sheet Selected */}
            {sheets.length > 0 && !selectedSheet && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600 mb-4">
                        table_chart
                    </span>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {t("polls.select_sheet")}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        {t("polls.select_sheet_description")}
                    </p>
                </div>
            )}

            {/* Data Content */}
            {sheetData && (
                <>
                    {/* Chart Section - Dynamic based on active column */}
                    <AnalyticsChart
                        sheetData={sheetData}
                        selectedColumnIndex={activeChartColumn}
                    />

                    {/* Data Table - Controls Filters & Active Chart Column */}
                    <AnalyticsTable
                        sheetData={sheetData}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        filters={filters}
                        columnUniqueValues={columnUniqueValues}
                        activeChartColumn={activeChartColumn}
                        onColumnSelect={setActiveChartColumn}
                        hiddenQuestions={hiddenQuestions}
                    />
                </>
            )}
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}
