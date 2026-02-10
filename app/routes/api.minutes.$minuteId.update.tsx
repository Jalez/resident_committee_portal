import { redirect, type ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { buildMinutePath } from "~/lib/minutes/utils";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";

export async function action({ request, params }: ActionFunctionArgs) {
    const { minuteId } = params;
    if (!minuteId) throw new Response("Minute ID required", { status: 400 });

    await requirePermission(request, "minutes:update", getDatabase);
    const db = getDatabase();

    const minute = await db.getMinuteById(minuteId);
    if (!minute) {
        throw new Response("Not Found", { status: 404 });
    }

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "update_minute") {
        const title = formData.get("title") as string;
        const description = formData.get("description") as string;
        const dateStr = formData.get("date") as string;

        let fileUrl = minute.fileUrl;
        let fileKey = minute.fileKey;

        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
            const year = new Date(dateStr).getFullYear().toString();
            const pathname = buildMinutePath(year, file.name);
            const storage = getMinuteStorage();
            const result = await storage.uploadFile(pathname, file, { access: "public" });
            fileUrl = result.url;
            fileKey = result.pathname;
        }

        await db.updateMinute(minute.id, {
            title,
            description,
            date: new Date(dateStr),
            fileUrl,
            fileKey,
        });

        // Auto-publish draft if all required fields are filled
        if (minute.status === "draft") {
            const newStatus = getDraftAutoPublishStatus("minute", minute.status, {
                title,
                date: dateStr,
            });
            if (newStatus) {
                await db.updateMinute(minute.id, { status: newStatus as any });
            }
        }

        // Save relationship changes using the new universal system
        await saveRelationshipChanges(db, "minute", minute.id, formData, null);

        // Check for source context to create auto-link
        const sourceType = formData.get("_sourceType") as string | null;
        const sourceId = formData.get("_sourceId") as string | null;
        if (sourceType && sourceId) {
            const exists = await db.entityRelationshipExists(
                sourceType as any,
                sourceId,
                "minute",
                minute.id,
            );
            if (!exists) {
                await db.createEntityRelationship({
                    relationAType: sourceType as any,
                    relationId: sourceId,
                    relationBType: "minute",
                    relationBId: minute.id,
                    createdBy: null,
                });
            }
        }

        // Handle returnUrl redirect (from source entity picker)
        const returnUrl = formData.get("_returnUrl") as string | null;
        if (returnUrl) {
            return redirect(returnUrl);
        }

        return redirect("/minutes");
    }

    return null;
}
