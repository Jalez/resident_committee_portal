/**
 * Committee mail inbox fetch via IMAP.
 * Optional: set IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASS to fetch inbox.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { DatabaseAdapter } from "~/db/adapters/types";

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

function addressesToJson(arr: { address?: string; name?: string }[] | undefined): string {
	if (!arr || arr.length === 0) return "[]";
	return JSON.stringify(
		arr.map((a) => ({ email: a.address || "", name: a.name || undefined })),
	);
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
				if (messageId && (await db.committeeMailMessageExistsByMessageId(messageId))) {
					continue;
				}
				let bodyHtml = "";
				let bodyText: string | null = null;
				if (msg.source) {
					try {
						const parsed = await simpleParser(msg.source);
						bodyHtml = parsed.html || "";
						bodyText = parsed.text || null;
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
