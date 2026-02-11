import { type ActionFunctionArgs, redirect } from "react-router";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";

export async function action({ request, params }: ActionFunctionArgs) {
	const { newsId } = params;
	if (!newsId) throw new Response("News ID required", { status: 400 });

	await requirePermission(request, "news:update", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();

	const title = (formData.get("title") as string)?.trim();
	const summary = (formData.get("summary") as string)?.trim() || null;
	const content = (formData.get("content") as string)?.trim();
	const titleSecondary =
		(formData.get("titleSecondary") as string)?.trim() || null;
	const summarySecondary =
		(formData.get("summarySecondary") as string)?.trim() || null;
	const contentSecondary =
		(formData.get("contentSecondary") as string)?.trim() || null;

	if (!title || !content) {
		return { error: "Title and content are required (default language)" };
	}

	const currentItem = await db.getNewsById(newsId);
	if (!currentItem) {
		throw new Response("News not found", { status: 404 });
	}

	const updateData: any = {
		title,
		summary,
		content,
		titleSecondary,
		summarySecondary,
		contentSecondary,
	};

	// Auto-publish draft
	if ((currentItem as any).status === "draft") {
		const { getDraftAutoPublishStatus } = await import(
			"~/lib/draft-auto-publish"
		);
		const newStatus = getDraftAutoPublishStatus("news", "draft", updateData);
		if (newStatus) {
			updateData.status = newStatus;
		}
	}

	await db.updateNews(newsId, updateData);

	// Handle returnUrl redirect (from source entity picker)
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect("/news");
}
