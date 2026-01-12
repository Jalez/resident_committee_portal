import type { Route } from "./+types/minutes";
import { useRouteLoaderData } from "react-router";
import { PageWrapper, SplitLayout, QRPanel } from "~/components/layout/page-layout";
import { getMinutesByYear, type MinutesByYear } from "~/lib/google.server";
import { queryClient } from "~/lib/query-client";
import { queryKeys, STALE_TIME } from "~/lib/query-config";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Pöytäkirjat / Minutes` },
        { name: "description", content: "Toimikunnan kokouspöytäkirjat / Tenant Committee Meeting Minutes" },
    ];
}

export async function loader({ }: Route.LoaderArgs) {
    const minutesByYear = await queryClient.ensureQueryData({
        queryKey: queryKeys.minutes,
        queryFn: getMinutesByYear,
        staleTime: STALE_TIME,
    });

    const archiveUrl = minutesByYear.find((y) => y.files.length > 0)?.folderUrl || "#";

    return {
        siteConfig: SITE_CONFIG,
        minutesByYear,
        archiveUrl,
    };
}

export default function Minutes({ loaderData }: Route.ComponentProps) {
    const { minutesByYear, archiveUrl } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const isStaff = rootData?.user?.role === "admin" || rootData?.user?.role === "board_member";

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

    const currentYear = new Date().getFullYear().toString();

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                header={{ finnish: "Pöytäkirjat", english: "Minutes" }}
            >
                <div className="space-y-8">
                    {/* Staff instructions for naming convention */}
                    {isStaff && (
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
                    {minutesByYear.map((yearGroup: MinutesByYear) => (
                        <div key={yearGroup.year} className="relative">
                            {/* Year header - same style as month headers in events */}
                            <div className="bg-primary -mx-8 mb-6 px-8 py-4 lg:-mx-12 lg:mb-6 lg:px-12 flex items-center justify-between text-white">
                                <p className="text-xl font-bold leading-none uppercase tracking-widest">
                                    {yearGroup.year}
                                </p>
                                {yearGroup.year === currentYear && (
                                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                                        Tämä vuosi / This Year
                                    </span>
                                )}
                            </div>

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
                        </div>
                    ))}

                    {minutesByYear.length === 0 && (
                        <div className="p-12 text-center text-gray-400 font-bold uppercase tracking-widest">
                            Ei pöytäkirjoja / No minutes
                        </div>
                    )}
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}

