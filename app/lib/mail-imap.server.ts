/**
 * Committee mail inbox fetch via IMAP.
 * Optional: set IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASS to fetch inbox.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { DatabaseAdapter } from "~/db/adapters/types";
import {
	extractPurchaseIdFromContent,
	extractPurchaseIdFromEmail,
	extractPurchaseIdFromSubject,
	parseReimbursementReply,
} from "./email.server";
import { computeThreadId } from "./mail-threading.server";
import { createReimbursementStatusNotification } from "./notifications.server";

const config = {
	host: process.env.IMAP_HOST || "",
	port: Number(process.env.IMAP_PORT) || 993,
	secure: process.env.IMAP_SECURE !== "false",
	user: process.env.IMAP_USER || "",
	pass: process.env.IMAP_PASS || "",
};

export function isImapConfigured(): boolean {
	return !!(config.host && config.user);
}

function addressesToJson(
	arr: { address?: string; name?: string }[] | undefined,
): string {
	if (!arr || arr.length === 0) return "[]";
	return JSON.stringify(
		arr.map((a) => ({ email: a.address || "", name: a.name || undefined })),
	);
}

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function findReimbursementPurchaseId({
	to,
	subject,
	bodyText,
	bodyHtml,
}: {
	to: { address?: string; name?: string }[] | undefined;
	subject: string;
	bodyText: string | null;
	bodyHtml: string;
}): string | null {
	if (to) {
		for (const entry of to) {
			if (!entry.address) continue;
			const match = extractPurchaseIdFromEmail(entry.address);
			if (match) return match;
		}
	}

	const subjectMatch = extractPurchaseIdFromSubject(subject);
	if (subjectMatch) return subjectMatch;

	if (bodyText) {
		const contentMatch = extractPurchaseIdFromContent(bodyText);
		if (contentMatch) return contentMatch;
	}

	if (bodyHtml) {
		const contentMatch = extractPurchaseIdFromContent(stripHtml(bodyHtml));
		if (contentMatch) return contentMatch;
	}

	return null;
}

async function applyReimbursementReply(
	db: DatabaseAdapter,
	purchaseId: string,
	content: string,
): Promise<void> {
	const purchase = await db.getPurchaseById(purchaseId);
	if (!purchase) return;

	const decision = await parseReimbursementReply(content);
	const updateData: {
		emailReplyReceived: boolean;
		emailReplyContent: string;
		status?: "approved" | "rejected" | "pending";
	} = {
		emailReplyReceived: true,
		emailReplyContent: content.substring(0, 1000),
	};

	if (decision === "approved") updateData.status = "approved";
	if (decision === "rejected") updateData.status = "rejected";

	await db.updatePurchase(purchaseId, updateData);

	if (decision === "approved" || decision === "rejected") {
		const updatedPurchase = await db.getPurchaseById(purchaseId);
		if (updatedPurchase) {
			await createReimbursementStatusNotification(
				updatedPurchase,
				decision,
				db,
			);
		}
	}

	if (decision === "approved" || decision === "rejected") {
		// Find linked transaction via entity relationships
		const relationships = await db.getEntityRelationships(
			"reimbursement",
			purchaseId,
		);
		const transactionId =
			relationships.find(
				(r) =>
					r.relationBType === "transaction" ||
					r.relationAType === "transaction",
			)?.relationBType === "transaction"
				? relationships.find((r) => r.relationBType === "transaction")
						?.relationBId
				: relationships.find((r) => r.relationAType === "transaction")
						?.relationId;

		if (transactionId) {
			const linkedTransaction = await db.getTransactionById(transactionId);
			if (linkedTransaction) {
				const newReimbursementStatus =
					decision === "approved" ? "approved" : "declined";
				const newTransactionStatus =
					decision === "approved" ? "complete" : "declined";
				await db.updateTransaction(linkedTransaction.id, {
					reimbursementStatus: newReimbursementStatus,
					status: newTransactionStatus,
				});
			}
		}
	}
}

/**
 * Fetch recent messages from INBOX and store new ones in committee_mail_messages.
 * Dedupes by message_id. Returns count of new messages stored.
 */
export async function fetchInboxMessages(
	db: DatabaseAdapter,
	limit = 50,
): Promise<{ count: number; error?: string }> {
	if (!isImapConfigured()) {
		return { count: 0, error: "IMAP not configured" };
	}

	const client = new ImapFlow({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: { user: config.user, pass: config.pass },
	});

	try {
		await client.connect();
		const lock = await client.getMailboxLock("INBOX");
		let stored = 0;
		try {
			const mailbox = client.mailbox;
			const exists =
				mailbox && typeof mailbox === "object" && "exists" in mailbox
					? (mailbox.exists as number)
					: 0;
			if (exists === 0) {
				return { count: 0 };
			}
			const start = Math.max(1, exists - limit + 1);
			const range = `${start}:${exists}`;
			for await (const msg of client.fetch(range, {
				envelope: true,
				source: true,
			})) {
				const envelope = msg.envelope;
				const messageId = envelope?.messageId?.trim() || null;
				if (
					messageId &&
					(await db.committeeMailMessageExistsByMessageId(messageId))
				) {
					continue;
				}
				let bodyHtml = "";
				let bodyText: string | null = null;
				let inReplyTo: string | null = null;
				let references: string[] | null = null;
				if (msg.source) {
					try {
						const parsed = await simpleParser(msg.source);
						bodyHtml = parsed.html || "";
						bodyText = parsed.text || null;
						inReplyTo = parsed.inReplyTo || null;
						const refs = parsed.references;
						if (refs) {
							references = Array.isArray(refs) ? refs : [refs];
						}
					} catch {
						bodyHtml = String(msg.source).slice(0, 50_000);
					}
				}
				if (!bodyHtml && bodyText) {
					bodyHtml = bodyText.replace(/\n/g, "<br>\n");
				}
				const from = envelope?.from?.[0];
				const fromAddress = from?.address || "";
				const fromName = from?.name || null;
				const toJson = addressesToJson(envelope?.to);
				const ccJson = envelope?.cc?.length
					? addressesToJson(envelope.cc)
					: null;
				const bccJson = envelope?.bcc?.length
					? addressesToJson(envelope.bcc)
					: null;
				const subject = envelope?.subject?.trim() || "(No subject)";
				const date = envelope?.date || new Date();
				const purchaseId = findReimbursementPurchaseId({
					to: envelope?.to,
					subject,
					bodyText,
					bodyHtml,
				});
				if (purchaseId) {
					const content = bodyText || stripHtml(bodyHtml) || subject;
					await applyReimbursementReply(db, purchaseId, content);
				}
				const threadId = computeThreadId(messageId, inReplyTo, references);
				await db.insertCommitteeMailMessage({
					direction: "inbox",
					fromAddress,
					fromName,
					toJson,
					ccJson,
					bccJson,
					subject,
					bodyHtml: bodyHtml || "(No body)",
					bodyText,
					date,
					messageId,
					inReplyTo,
					referencesJson: references ? JSON.stringify(references) : null,
					threadId,
				});
				stored++;
			}
		} finally {
			lock.release();
		}
		await client.logout();
		return { count: stored };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { count: 0, error: message };
	}
}
