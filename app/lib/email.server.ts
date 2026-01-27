/**
 * Email utility for sending purchase reimbursement requests
 * Uses Resend for email delivery with inbound reply support
 *
 * Required env vars:
 * - RESEND_API_KEY: API key from Resend
 * - SENDER_EMAIL: Email address to send from (must be verified in Resend)
 * - RECIPIENT_EMAIL: Building owner email to receive reimbursement requests
 * - RESEND_INBOUND_EMAIL: Your Resend receiving address (e.g., xxx@abc123.resend.app)
 * - RESEND_WEBHOOK_SECRET: Secret for verifying webhook signatures
 */

import { Resend } from "resend";
import { getFileAsBase64 } from "./google.server";

interface EmailConfig {
	resendApiKey: string;
	senderEmail: string;
	recipientEmail: string;
	inboundEmail: string;
	webhookSecret: string;
}

const emailConfig: EmailConfig = {
	resendApiKey: process.env.RESEND_API_KEY || "",
	senderEmail: process.env.SENDER_EMAIL || "onboarding@resend.dev",
	recipientEmail: process.env.RECIPIENT_EMAIL || "",
	inboundEmail: process.env.RESEND_INBOUND_EMAIL || "",
	webhookSecret: process.env.RESEND_WEBHOOK_SECRET || "",
};

console.log("[Email Config]", {
	resendApiKey: emailConfig.resendApiKey ? "SET" : "MISSING",
	senderEmail: emailConfig.senderEmail,
	recipientEmail: emailConfig.recipientEmail || "MISSING",
	inboundEmail: emailConfig.inboundEmail || "NOT_CONFIGURED",
	webhookSecret: emailConfig.webhookSecret ? "SET" : "NOT_CONFIGURED",
});

interface ReceiptLink {
	id: string;
	name: string;
	url: string;
}

interface ReimbursementEmailData {
	itemName: string;
	itemValue: string;
	purchaserName: string;
	bankAccount: string;
	minutesReference: string;
	minutesUrl?: string;
	notes?: string;
	receiptLinks?: ReceiptLink[];
}

interface EmailAttachment {
	name: string;
	type: string;
	content: string; // base64
}

interface SendEmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

/**
 * Generate the Reply-To address for a specific purchase
 * Format: reimbursement-{purchaseId}@{resend-domain}.resend.app
 */
export function getReplyToAddress(purchaseId: string): string | null {
	if (!emailConfig.inboundEmail) {
		return null;
	}
	// Extract the domain part (e.g., "abc123.resend.app" from "anything@abc123.resend.app")
	const atIndex = emailConfig.inboundEmail.indexOf("@");
	if (atIndex === -1) {
		console.error("[getReplyToAddress] Invalid RESEND_INBOUND_EMAIL format");
		return null;
	}
	const domain = emailConfig.inboundEmail.substring(atIndex + 1);
	return `reimbursement-${purchaseId}@${domain}`;
}

/**
 * Extract purchase ID from a reply-to address
 * Returns null if the address doesn't match the expected format
 */
export function extractPurchaseIdFromEmail(toAddress: string): string | null {
	const match = toAddress.match(/^reimbursement-([a-f0-9-]+)@/i);
	return match ? match[1] : null;
}

/**
 * Parse email reply content to determine approval status
 * Uses DB-based keywords and optional AI parsing
 * Returns: "approved" | "rejected" | "unclear"
 */
export async function parseReimbursementReply(
	content: string,
): Promise<"approved" | "rejected" | "unclear"> {
	// Import from openrouter.server.ts
	const { isAIParsingEnabled, parseReplyWithAI, getKeywords } = await import(
		"./openrouter.server"
	);

	const lowerContent = content.toLowerCase();

	// First, try AI parsing if enabled
	const aiConfig = await isAIParsingEnabled();
	if (aiConfig.enabled && aiConfig.apiKey && aiConfig.model) {
		console.log("[Email] Attempting AI parsing with model:", aiConfig.model);
		const aiDecision = await parseReplyWithAI(
			content,
			aiConfig.apiKey,
			aiConfig.model,
		);
		if (aiDecision !== "unclear") {
			console.log("[Email] AI decision:", aiDecision);
			return aiDecision;
		}
		console.log("[Email] AI returned unclear, falling back to keywords");
	}

	// Fallback to keyword matching using DB-based keywords
	const keywords = await getKeywords();

	// Short keywords (2-3 chars) need word boundary matching
	const shortKeywordThreshold = 4;

	// Check approval keywords
	for (const keyword of keywords.approval) {
		if (keyword.length < shortKeywordThreshold) {
			const regex = new RegExp(`\\b${keyword}\\b`, "i");
			if (regex.test(lowerContent)) {
				return "approved";
			}
		} else if (lowerContent.includes(keyword.toLowerCase())) {
			return "approved";
		}
	}

	// Check rejection keywords
	for (const keyword of keywords.rejection) {
		if (keyword.length < shortKeywordThreshold) {
			const regex = new RegExp(`\\b${keyword}\\b`, "i");
			if (regex.test(lowerContent)) {
				return "rejected";
			}
		} else if (lowerContent.includes(keyword.toLowerCase())) {
			return "rejected";
		}
	}

	return "unclear";
}

/**
 * Send reimbursement request email with receipt links and optional attachments
 * Now returns message ID for tracking replies
 *
 * Receipt files are stored in Google Drive and attached when available.
 * Links remain as a fallback for recipients that prefer to open in Drive.
 */
export async function sendReimbursementEmail(
	data: ReimbursementEmailData,
	purchaseId: string,
	minutesFile?: EmailAttachment,
	receiptFiles?: EmailAttachment[],
): Promise<SendEmailResult> {
	if (!emailConfig.recipientEmail) {
		console.error("[sendReimbursementEmail] Missing RECIPIENT_EMAIL");
		return { success: false, error: "Missing RECIPIENT_EMAIL" };
	}

	if (!emailConfig.resendApiKey) {
		console.error("[sendReimbursementEmail] Missing RESEND_API_KEY");
		return { success: false, error: "Missing RESEND_API_KEY" };
	}

	try {
		const resend = new Resend(emailConfig.resendApiKey);

		const subject = `Kulukorvaus / Reimbursement: ${data.itemName} (${data.itemValue} €)`;

		// Generate reply-to address for this specific purchase
		const replyTo = getReplyToAddress(purchaseId);

		// Build receipt links HTML
		const receiptLinksHtml =
			data.receiptLinks && data.receiptLinks.length > 0
				? `<tr>
                <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;"><strong>Kuitit / Receipts:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">
                    ${data.receiptLinks
											.map(
												(r) =>
													`<a href="${r.url}" target="_blank" style="color: #2563eb; text-decoration: underline; display: block; margin-bottom: 4px;">📄 ${r.name}</a>`,
											)
											.join("")}
                </td>
               </tr>`
				: "";

		const htmlBody = `
            <h2>Kulukorvaus pyyntö / Reimbursement Request</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tavara / Item:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.itemName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Summa / Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.itemValue} €</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Ostaja / Purchaser:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.purchaserName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tilinumero / Bank Account:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.bankAccount}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Pöytäkirja / Minutes:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.minutesUrl ? `<a href="${data.minutesUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${data.minutesReference}</a>` : data.minutesReference}</td></tr>
                ${receiptLinksHtml}
                ${data.notes ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Lisätiedot / Notes:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.notes}</td></tr>` : ""}
            </table>
            ${replyTo ? `<p style="margin-top: 16px; color: #888; font-size: 12px;">Vastaa tähän viestiin hyväksyäksesi tai hylätäksesi pyynnön.<br/>Reply to this email to approve or reject the request.</p>` : ""}
        `;

		const attachments: { filename: string; content: string }[] = [];

		if (minutesFile) {
			attachments.push({
				filename: minutesFile.name,
				content: minutesFile.content,
			});
		}

		if (receiptFiles && receiptFiles.length > 0) {
			for (const receipt of receiptFiles) {
				attachments.push({
					filename: receipt.name,
					content: receipt.content,
				});
			}
		}

		const { data: responseData, error } = await resend.emails.send({
			from: emailConfig.senderEmail,
			to: emailConfig.recipientEmail,
			replyTo: replyTo || undefined,
			subject,
			html: htmlBody,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		if (error) {
			console.error("[sendReimbursementEmail] Resend Error:", error);
			return { success: false, error: error.message };
		}

		console.log(
			`[sendReimbursementEmail] Successfully sent email for: ${data.itemName}, messageId: ${responseData?.id}`,
		);
		return {
			success: true,
			messageId: responseData?.id,
		};
	} catch (error) {
		console.error("[sendReimbursementEmail] Error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Build attachments for receipt links by downloading files from Google Drive
 */
export async function buildReceiptAttachments(
	receiptLinks?: ReceiptLink[],
): Promise<EmailAttachment[]> {
	if (!receiptLinks || receiptLinks.length === 0) {
		return [];
	}

	const attachments = await Promise.all(
		receiptLinks.map(async (receipt) => {
			try {
				const content = await getFileAsBase64(receipt.id);
				if (!content) {
					console.warn(
						`[buildReceiptAttachments] Failed to download receipt: ${receipt.id}`,
					);
					return null;
				}
				return {
					name: receipt.name,
					type: "application/octet-stream",
					content,
				};
			} catch (error) {
				console.error(
					`[buildReceiptAttachments] Error downloading receipt ${receipt.id}:`,
					error,
				);
				return null;
			}
		}),
	);

	return attachments.filter((a): a is EmailAttachment => a !== null);
}

/**
 * Build attachment for minutes file by downloading from Google Drive
 */
export async function buildMinutesAttachment(
	minutesId?: string | null,
	minutesName?: string | null,
): Promise<EmailAttachment | null> {
	if (!minutesId) {
		return null;
	}

	try {
		const content = await getFileAsBase64(minutesId);
		if (!content) {
			console.warn(
				`[buildMinutesAttachment] Failed to download minutes: ${minutesId}`,
			);
			return null;
		}

		const baseName = minutesName?.trim()
			? minutesName.trim()
			: `minutes-${minutesId}`;
		const filename = baseName.toLowerCase().endsWith(".pdf")
			? baseName
			: `${baseName}.pdf`;

		return {
			name: filename,
			type: "application/pdf",
			content,
		};
	} catch (error) {
		console.error(
			`[buildMinutesAttachment] Error downloading minutes ${minutesId}:`,
			error,
		);
		return null;
	}
}

/**
 * Check if email is configured
 */
export function isEmailConfigured(): boolean {
	return !!(emailConfig.resendApiKey && emailConfig.recipientEmail);
}

/**
 * Check if inbound email is configured
 */
export function isInboundEmailConfigured(): boolean {
	return !!(emailConfig.inboundEmail && emailConfig.webhookSecret);
}

/**
 * Get the webhook secret for signature verification
 */
export function getWebhookSecret(): string {
	return emailConfig.webhookSecret;
}
