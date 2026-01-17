import type { Route } from "./+types/minutes";
import { PageWrapper, SplitLayout, QRPanel, ActionButton, ContentArea } from "~/components/layout/page-layout";
import { SearchMenu, type SearchField } from "~/components/search-menu";
import { getMinutesByYear, type MinutesByYear } from "~/lib/google.server";
import { queryClient } from "~/lib/query-client";
import { queryKeys, STALE_TIME } from "~/lib/query-config";
import { SITE_CONFIG } from "~/lib/config.server";
import { useUser } from "~/contexts/user-context";
import { getAuthenticatedUser, getGuestPermissions } from "~/lib/auth.server";
import { getDatabase } from "~/db";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "~/components/ui/accordion";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Pöytäkirjat / Minutes` },
        { name: "description", content: "Toimikunnan kokouspöytäkirjat / Tenant Committee Meeting Minutes" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    // Check permission (works for both logged-in users and guests)
    const authUser = await getAuthenticatedUser(request, getDatabase);
    const permissions = authUser
        ? authUser.permissions
        : await getGuestPermissions(() => getDatabase());

    const canRead = permissions.some(p => p === "minutes:read" || p === "*");
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

    const url = new URL(request.url);
    const yearFilter = url.searchParams.get("year") || "";
    const nameFilter = url.searchParams.get("name") || "";
    const hasFilters = yearFilter || nameFilter;

    const minutesByYear = await queryClient.ensureQueryData({
        queryKey: queryKeys.minutes,
        queryFn: getMinutesByYear,
        staleTime: STALE_TIME,
    });

    const archiveUrl = minutesByYear.find((y) => y.files.length > 0)?.folderUrl || "#";
    const uniqueYears = minutesByYear.map(y => y.year).sort().reverse();

    return {
        siteConfig: SITE_CONFIG,
        minutesByYear,
        archiveUrl,
        uniqueYears,
        filters: { year: yearFilter, name: nameFilter },
        hasFilters,
    };
}

export default function Minutes({ loaderData }: Route.ComponentProps) {
    const { minutesByYear, archiveUrl, uniqueYears, filters, hasFilters } = loaderData;
    const { hasPermission } = useUser();
    const canSeeNamingGuide = hasPermission("minutes:naming-guide");
    const currentYear = new Date().getFullYear().toString();

    // Configure search fields
    const searchFields: SearchField[] = [
        {
            name: "name",
            label: "Nimi / Name",
            type: "text",
            placeholder: "Hae nimellä...",
        },
        {
            name: "year",
            label: "Vuosi / Year",
            type: "select",
            placeholder: "Valitse vuosi...",
            options: uniqueYears,
        },
    ];

    // Filter minutes based on filters
    const filteredMinutes: MinutesByYear[] = minutesByYear
        .filter((yearGroup: MinutesByYear) => !filters?.year || yearGroup.year === filters.year)
        .map((yearGroup: MinutesByYear) => ({
            ...yearGroup,
            files: yearGroup.files.filter(file =>
                !filters?.name || file.name.toLowerCase().includes(filters.name.toLowerCase())
            )
        }))
        .filter((yearGroup: MinutesByYear) => yearGroup.files.length > 0);

    // QR Panel only shown in info reel mode
    const RightContent = (
        <QRPanel
            qrUrl={archiveUrl}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    Kaikki pöytäkirjat <br />
                    <span className="text-3xl text-gray-400 font-bold">All Minutes</span>
                </h2>
            }
        />
    );

    // Header actions: Search + Link button
    const FooterContent = (
        <div className="flex items-center gap-2">
            <SearchMenu fields={searchFields} />
            <ActionButton
                href={archiveUrl}
                icon="folder_open"
                labelFi="Arkisto"
                labelEn="Archive"
                external={true}
            />
        </div>
    );

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                footer={FooterContent}
                header={{ finnish: "Pöytäkirjat", english: "Minutes" }}
            >
                <div className="space-y-8">
                    {/* Staff instructions for naming convention - outside scrollable area */}
                    {canSeeNamingGuide && (
                        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 shrink-0">
                                    info
                                </span>
                                <div className="text-sm text-blue-800 dark:text-blue-200">
                                    <p className="font-bold mb-1">
                                        Pöytäkirjojen nimeäminen / Naming Minutes
                                    </p>
                                    <p className="mb-2">
                                        Käytä muotoa / Use format: <code className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded font-mono text-xs">YYYY-MM-DD_KuvausName.pdf</code>
                                    </p>
                                    <p className="text-xs opacity-80">
                                        Esim: 2026-01-05_Hallituksen_kokous_1.pdf — Tiedostot järjestyvät automaattisesti uusin ensin.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Scrollable accordion list */}
                    <ContentArea>
                        {filteredMinutes.length === 0 ? (
                            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-6 text-center">
                                <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">description</span>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {hasFilters ? "Ei tuloksia / No results" : "Ei pöytäkirjoja / No minutes"}
                                </p>
                            </div>
                        ) : (
                            <Accordion type="single" collapsible defaultValue={currentYear} className="space-y-4">
                                {filteredMinutes.map((yearGroup: MinutesByYear) => (
                                    <AccordionItem key={yearGroup.year} value={yearGroup.year} className="border-none">
                                        {/* Year header trigger - styled like month headers */}
                                        <AccordionTrigger className="bg-primary rounded-xl px-8 py-4 text-white hover:no-underline hover:bg-primary/90 [&[data-state=open]>svg]:rotate-180">
                                            <div className="flex items-center justify-between w-full pr-4">
                                                <p className="text-xl font-bold leading-none uppercase tracking-widest">
                                                    {yearGroup.year}
                                                </p>
                                                {yearGroup.year === currentYear && (
                                                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                                                        Tämä vuosi / This Year
                                                    </span>
                                                )}
                                            </div>
                                        </AccordionTrigger>

                                        <AccordionContent className="pt-4 pb-0">
                                            {/* Files list or placeholder */}
                                            {yearGroup.files.length === 0 ? (
                                                <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/50 text-center">
                                                    <p className="text-gray-400 font-medium">
                                                        Ei vielä pöytäkirjoja / No minutes yet
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {yearGroup.files.map((file) => (
                                                        <a
                                                            key={file.id}
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="block group"
                                                        >
                                                            <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                                                <div className="flex-1 min-w-0">
                                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors truncate">
                                                                        {file.name}
                                                                    </h3>
                                                                </div>
                                                                <span className="material-symbols-outlined text-gray-300 group-hover:text-primary transition-colors shrink-0 ml-4">
                                                                    description
                                                                </span>
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        )}
                    </ContentArea>
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}

