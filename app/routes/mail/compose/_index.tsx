import { redirect } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "committee:email", getDatabase);
    const db = getDatabase();
    const url = new URL(request.url);

    const replyTo = url.searchParams.get("replyTo");
    const replyAllTo = url.searchParams.get("replyAllTo");
    const forward = url.searchParams.get("forward");

    let draftType: "new" | "reply" | "replyAll" | "forward" = "new";
    let replyToMessageId: string | null = null;
    let forwardFromMessageId: string | null = null;

    if (replyTo && UUID_REGEX.test(replyTo)) {
        draftType = "reply";
        replyToMessageId = replyTo;
    } else if (replyAllTo && UUID_REGEX.test(replyAllTo)) {
        draftType = "replyAll";
        replyToMessageId = replyAllTo;
    } else if (forward && UUID_REGEX.test(forward)) {
        draftType = "forward";
        forwardFromMessageId = forward;
    }

    // Create the draft immediately on the server
    const draft = await db.insertMailDraft({
        toJson: "[]",
        ccJson: null,
        bccJson: null,
        subject: null,
        body: null,
        draftType,
        replyToMessageId,
        forwardFromMessageId,
    });

    // Copy relationships from the original thread to the new draft
    const parentMsgId = replyToMessageId || forwardFromMessageId;
    if (parentMsgId) {
        const parentMessage = await db.getCommitteeMailMessageById(parentMsgId);
        if (parentMessage?.threadId) {
            const threadMessages = await db.getCommitteeMailMessagesByThreadId(parentMessage.threadId);
            const seenRelations = new Set<string>();

            for (const msg of threadMessages) {
                const relations = await db.getEntityRelationships("mail", msg.id);
                for (const rel of relations) {
                    const isMailA = rel.relationAType === "mail" && rel.relationId === msg.id;
                    const isMailB = rel.relationBType === "mail" && rel.relationBId === msg.id;
                    if (!isMailA && !isMailB) continue;

                    const relatedType = isMailA ? rel.relationBType : rel.relationAType;
                    const relatedId = isMailA ? rel.relationBId : rel.relationId;
                    if (relatedType === "mail") continue;

                    const key = `${relatedType}:${relatedId}`;
                    if (!seenRelations.has(key)) {
                        seenRelations.add(key);
                        const exists = await db.entityRelationshipExists(
                            "mail",
                            draft.id,
                            relatedType as any,
                            relatedId,
                        );
                        if (!exists) {
                            await db.createEntityRelationship({
                                relationAType: "mail",
                                relationId: draft.id,
                                relationBType: relatedType as any,
                                relationBId: relatedId,
                                createdBy: null,
                            });
                        }
                    }
                }
            }
        }
    }

    // Redirect to the new standard edit path
    const targetUrl = new URL(`/mail/drafts/${draft.id}/edit`, request.url);

    // Preserve other params like returnUrl or source context if needed
    for (const [key, value] of url.searchParams.entries()) {
        if (!["replyTo", "replyAllTo", "forward", "draftId"].includes(key)) {
            targetUrl.searchParams.set(key, value);
        }
    }

    return redirect(targetUrl.toString());
}

export default function MailComposeRedirect() {
    return null;
}
