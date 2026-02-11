import { type ActionFunctionArgs, redirect } from "react-router";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";

export async function action({ request, params }: ActionFunctionArgs) {
	const { faqId } = params;
	if (!faqId) throw new Response("FAQ ID required", { status: 400 });

	await requirePermission(request, "faq:update", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();

	const question = (formData.get("question") as string)?.trim();
	const answer = (formData.get("answer") as string)?.trim();
	const questionSecondary =
		(formData.get("questionSecondary") as string)?.trim() || null;
	const answerSecondary =
		(formData.get("answerSecondary") as string)?.trim() || null;
	const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);

	if (!question || !answer) {
		return { error: "Question and answer are required (default language)" };
	}

	const currentItem = await db.getFaqById(faqId);
	if (!currentItem) {
		throw new Response("FAQ not found", { status: 404 });
	}

	const updateData: any = {
		question,
		answer,
		questionSecondary,
		answerSecondary,
		sortOrder,
	};

	// Auto-publish draft
	if ((currentItem as any).status === "draft") {
		const { getDraftAutoPublishStatus } = await import(
			"~/lib/draft-auto-publish"
		);
		const newStatus = getDraftAutoPublishStatus("faq", "draft", updateData);
		if (newStatus) {
			updateData.status = newStatus;
		}
	}

	await db.updateFaq(faqId, updateData);

	// Handle returnUrl redirect (from source entity picker)
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect("/faq");
}
