/**
 * Email threading utilities.
 * Used by IMAP fetch and send actions to manage conversation threads
 * following standard email headers (In-Reply-To / References per RFC 5322).
 */

/**
 * Compute threadId from email headers.
 * Uses the first reference (thread root) if available,
 * falls back to inReplyTo, then to the message's own messageId.
 */
export function computeThreadId(
	messageId: string | null,
	inReplyTo: string | null,
	references: string[] | null,
): string | null {
	if (references && references.length > 0) return references[0];
	if (inReplyTo) return inReplyTo;
	return messageId;
}

/**
 * Resolve a thread ID using locally known messages first.
 *
 * Some clients include unrelated or oversized References chains. For the portal's
 * internal grouping, prefer headers that point to messages we already know about.
 * If no known message is found, fall back conservatively instead of trusting an
 * arbitrary external reference root.
 */
export async function resolveThreadIdFromKnownMessages(
	messageId: string | null,
	inReplyTo: string | null,
	references: string[] | null,
	findKnownMessage: (
		messageId: string,
	) => Promise<{ threadId: string | null; messageId: string | null } | null>,
): Promise<string | null> {
	if (inReplyTo) {
		const parent = await findKnownMessage(inReplyTo);
		if (parent?.threadId) return parent.threadId;
		if (parent?.messageId) return parent.messageId;
	}

	if (references) {
		for (const ref of references) {
			const known = await findKnownMessage(ref);
			if (known?.threadId) return known.threadId;
			if (known?.messageId) return known.messageId;
		}
	}

	return computeThreadId(messageId, inReplyTo, null);
}

/**
 * Build the References header for a reply.
 * Per RFC 5322: References = parent's References + parent's Message-ID
 */
export function buildReferencesForReply(
	parentMessageId: string | null,
	parentReferences: string[] | null,
): string[] {
	const refs = [...(parentReferences || [])];
	if (parentMessageId && !refs.includes(parentMessageId)) {
		refs.push(parentMessageId);
	}
	return refs;
}

/**
 * Build Gmail-style quoted reply HTML block.
 */
export function buildQuotedReplyHtml(
	originalDate: Date | string,
	fromName: string,
	fromEmail: string,
	bodyHtml: string,
): string {
	const d =
		typeof originalDate === "string" ? new Date(originalDate) : originalDate;
	const dateStr = d.toLocaleString("en-US", {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
	const sender = fromName ? `${fromName} &lt;${fromEmail}&gt;` : fromEmail;

	return `<div style="padding-top:12px;margin-top:12px;border-top:1px solid #ccc">
<p style="color:#666;font-size:12px;margin:0 0 8px">On ${dateStr}, ${sender} wrote:</p>
<blockquote style="border-left:2px solid #ccc;padding-left:12px;margin:0;color:#666">${bodyHtml}</blockquote>
</div>`;
}

// Re-export client-safe utilities for convenience in server code
export { addForwardPrefix, addReplyPrefix } from "./mail-utils";
