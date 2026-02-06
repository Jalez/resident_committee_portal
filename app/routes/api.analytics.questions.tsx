import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { getAnalyticsSheets, getSheetData } from "~/lib/google.server";
import type { Route } from "./+types/api.analytics.questions";

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "settings:analytics", getDatabase);

    const sheets = await getAnalyticsSheets();
    const allQuestions = new Set<string>();

    await Promise.all(
        sheets.map(async (sheet) => {
            const sheetData = await getSheetData(sheet.id);
            if (sheetData?.headers) {
                for (const header of sheetData.headers) {
                    if (header.trim()) {
                        allQuestions.add(header);
                    }
                }
            }
        }),
    );

    return {
        allQuestions: Array.from(allQuestions).sort(),
    };
}
