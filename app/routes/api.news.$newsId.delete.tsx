import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";

export async function loader({ request: _request, params }: LoaderFunctionArgs) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
            "Content-Type": "application/json",
            Allow: "DELETE",
        },
    });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { newsId } = params;
    let jsonData: any = null;
    try {
        jsonData = await request.json();
    } catch {
        // Ignore JSON parse errors
    }

    if (request.method !== "DELETE" && request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (!newsId) {
        return new Response(JSON.stringify({ error: "News ID is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    await requirePermission(request, "news:delete", getDatabase);

    const db = getDatabase();
    const item = await db.getNewsById(newsId);

    if (!item) {
        return new Response(JSON.stringify({ error: "News item not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        // News items don't have linked entities in the same way treasury items do (usually)
        // but we should still check if there are any entity relationships
        const relationships = await db.getEntityRelationships("news", item.id);
        if (relationships.length > 0) {
            return new Response(
                JSON.stringify({
                    error: "Cannot delete a linked item. Remove all links first.",
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }

        await db.deleteNews(item.id);

        const returnUrl = jsonData?._returnUrl as string | null;
        if (returnUrl) {
            return redirect(returnUrl);
        }
        return Response.json({ success: true });
    } catch (error) {
        console.error("[api.news.delete]", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Delete failed",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
}
