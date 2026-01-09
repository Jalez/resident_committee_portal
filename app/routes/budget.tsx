import { Link } from "react-router";
import type { Route } from "./+types/budget";
import { PageWrapper, SplitLayout, QRPanel, PageHeader } from "~/components/layout/page-layout";

export function meta() {
    return [
        { title: "Toas Hippos - Budjetti / Budget" },
        { name: "description", content: "Toimikunnan budjetti / Tenant Committee Budget" },
    ];
}

import { getBudgetInfo } from "~/lib/google.server";

export async function loader({ }: Route.LoaderArgs) {
    const budgetData = await getBudgetInfo();

    return {
        remainingBudget: budgetData?.remaining || "--- €",
        totalBudget: budgetData?.total || "--- €",
        lastUpdated: budgetData?.lastUpdated || "",
        detailsUrl: budgetData?.detailsUrl || "#"
    };
}

export default function Budget({ loaderData }: Route.ComponentProps) {
    const { remainingBudget, totalBudget, lastUpdated, detailsUrl } = loaderData;

    const RightContent = (
        <QRPanel
            qrUrl={detailsUrl}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    Katso erittely <br />
                    <span className="text-lg text-gray-400 font-bold">See Breakdown</span>
                </h2>
            }
        />
    );

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                header={{ finnish: "Budjetti", english: "Budget" }}
            >
                <div className="space-y-8">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Jäljellä oleva budjetti / Remaining Budget</p>
                        <p className="text-5xl lg:text-7xl font-black text-gray-900 dark:text-white tracking-tighter">{remainingBudget}</p>
                    </div>

                    <div>
                        <p className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Kokonaisbudjetti / Total Budget</p>
                        <p className="text-2xl lg:text-3xl font-bold text-gray-700 dark:text-gray-300">{totalBudget}</p>
                    </div>

                    <div className="inline-block bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Päivitetty / Updated: <span className="font-bold text-gray-900 dark:text-white">{lastUpdated}</span>
                        </p>
                    </div>
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}
