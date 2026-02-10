import { redirect, type ActionFunctionArgs } from "react-router";
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
    const questionSecondary = (formData.get("questionSecondary") as string)?.trim() || null;
    const answerSecondary = (formData.get("answerSecondary") as string)?.trim() || null;
    const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);

    if (!question || !answer) {
        return { error: "Question and answer are required (default language)" };
    }

    await db.updateFaq(faqId, {
        question,
        answer,
        questionSecondary,
        answerSecondary,
        sortOrder,
    });

    // Handle returnUrl redirect (from source entity picker)
    const returnUrl = formData.get("_returnUrl") as string | null;
    if (returnUrl) {
        return redirect(returnUrl);
    }

    return redirect("/faq");
}
