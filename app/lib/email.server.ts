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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resend } from "resend";
import { getFileAsBase64 } from "./google.server";
import { getSystemLanguageDefaults } from "./settings.server";

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

// Cache for loaded translations
const translationCache: Record<string, Record<string, unknown>> = {};

/**
 * Load translations for a specific language
 */
function loadTranslations(lang: string): Record<string, unknown> {
	if (translationCache[lang]) {
		return translationCache[lang];
	}

	try {
		const filePath = resolve(`./public/locales/${lang}/common.json`);
		const content = readFileSync(filePath, "utf-8");
		translationCache[lang] = JSON.parse(content);
		return translationCache[lang];
	} catch (error) {
		console.warn(`[loadTranslations] Failed to load ${lang}, falling back to fi`);
		if (lang !== "fi") {
			return loadTranslations("fi");
		}
		return {};
	}
}

/**
 * Get a nested translation value
 */
function getTranslation(translations: Record<string, unknown>, key: string): string {
	const keys = key.split(".");
	let value: unknown = translations;
	for (const k of keys) {
		if (value && typeof value === "object" && k in value) {
			value = (value as Record<string, unknown>)[k];
		} else {
			return key; // Return key if not found
		}
	}
	return typeof value === "string" ? value : key;
}

/**
 * Get bilingual text for email (primary / secondary)
 */
export function bilingualText(
	primaryLang: string,
	secondaryLang: string,
	key: string,
): string {
	const primaryTranslations = loadTranslations(primaryLang);
	const secondaryTranslations = loadTranslations(secondaryLang);
	
	const primary = getTranslation(primaryTranslations, key);
	const secondary = getTranslation(secondaryTranslations, key);
	
	// If same language or same translation, return just one
	if (primaryLang === secondaryLang || primary === secondary) {
		return primary;
	}
	
	return `${primary} / ${secondary}`;
}

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
	// minutesUrl removed - files are attached instead of linked
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
 * Uses app's default language settings for bilingual email content.
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

	// Get app's default language settings
	const systemLanguages = await getSystemLanguageDefaults();
	const primaryLang = systemLanguages.primary;
	const secondaryLang = systemLanguages.secondary;

	// Helper to get bilingual text
	const t = (key: string) => bilingualText(primaryLang, secondaryLang, key);

	try {
		const resend = new Resend(emailConfig.resendApiKey);

		const subject = `${t("email.reimbursement.subject")}: ${data.itemName} (${data.itemValue} €)`;

		// Generate reply-to address for this specific purchase
		const replyTo = getReplyToAddress(purchaseId);

		// Build receipt list HTML (no links, files are attached)
		const receiptListHtml =
			data.receiptLinks && data.receiptLinks.length > 0
				? `<tr>
                <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;"><strong>${t("email.reimbursement.receipts")}:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">
                    ${data.receiptLinks
											.map(
												(r) =>
													`<span style="display: block; margin-bottom: 4px;">📄 ${r.name} <em style="color: #666;">(${t("email.reimbursement.attached")})</em></span>`,
											)
											.join("")}
                </td>
               </tr>`
				: "";

		// Minutes reference - show filename with "attached" note (no link)
		const minutesHtml = data.minutesReference
			? `${data.minutesReference} <em style="color: #666;">(${t("email.reimbursement.attached")})</em>`
			: t("email.reimbursement.not_specified");

		const htmlBody = `
            <h2>${t("email.reimbursement.title")}</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.item")}:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.itemName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.amount")}:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.itemValue} €</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.purchaser")}:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.purchaserName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.bank_account")}:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.bankAccount}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.minutes")}:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${minutesHtml}</td></tr>
                ${receiptListHtml}
                ${data.notes ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.notes")}:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.notes}</td></tr>` : ""}
            </table>
            ${replyTo ? `<p style="margin-top: 16px; color: #888; font-size: 12px;">${t("email.reimbursement.reply_instruction")}</p>` : ""}
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
 * Send reimbursement status update email to the user who created the request
 * Notifies users when their reimbursement requests are approved or declined
 */
export async function sendReimbursementStatusEmail(
	userEmail: string,
	userPrimaryLanguage: string,
	userSecondaryLanguage: string,
	purchaseDescription: string,
	purchaseAmount: string,
	status: "approved" | "rejected",
	purchaseId: string,
): Promise<SendEmailResult> {
	// In dev mode, log instead of sending (or send to test email if configured)
	const isDev = process.env.NODE_ENV !== "production";
	const testEmail = process.env.TEST_EMAIL;

	if (isDev && !testEmail) {
		console.log("[sendReimbursementStatusEmail] Dev mode - would send email:", {
			to: userEmail,
			status,
			purchaseDescription,
			purchaseAmount,
		});
		return { success: true, messageId: "dev-mode-logged" };
	}

	if (!emailConfig.resendApiKey) {
		console.error("[sendReimbursementStatusEmail] Missing RESEND_API_KEY");
		return { success: false, error: "Missing RESEND_API_KEY" };
	}

	// Use test email in dev mode if configured, otherwise use user's email
	const recipientEmail = isDev && testEmail ? testEmail : userEmail;

	// Helper to get bilingual text using user's language preferences
	const t = (key: string) => bilingualText(userPrimaryLanguage, userSecondaryLanguage, key);

	try {
		const resend = new Resend(emailConfig.resendApiKey);

		const statusKey = status === "approved" ? "approved" : "declined";
		const subject = t(`email.reimbursement_status.${statusKey}.subject`);

		// Build email body
		const statusColor = status === "approved" ? "#22c55e" : "#ef4444";
		const statusText = t(`email.reimbursement_status.${statusKey}.title`);
		const messageText = t(`email.reimbursement_status.${statusKey}.message`);

		const htmlBody = `
			<h2>${statusText}</h2>
			<p>${messageText}</p>
			<table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-top: 16px;">
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.item")}:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">${purchaseDescription}</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement.amount")}:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">${purchaseAmount} €</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>${t("email.reimbursement_status.status")}:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">
						<span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
					</td>
				</tr>
			</table>
			<p style="margin-top: 16px;">
				<a href="${process.env.SITE_URL || "http://localhost:5173"}/treasury/reimbursements" style="color: #3b82f6; text-decoration: underline;">
					${t("email.reimbursement_status.view_details")}
				</a>
			</p>
		`;

		const { data: responseData, error } = await resend.emails.send({
			from: emailConfig.senderEmail,
			to: recipientEmail,
			subject,
			html: htmlBody,
		});

		if (error) {
			console.error("[sendReimbursementStatusEmail] Resend Error:", error);
			return { success: false, error: error.message };
		}

		console.log(
			`[sendReimbursementStatusEmail] Successfully sent status email to ${recipientEmail} for purchase ${purchaseId}, messageId: ${responseData?.id}`,
		);
		return {
			success: true,
			messageId: responseData?.id,
		};
	} catch (error) {
		console.error("[sendReimbursementStatusEmail] Error:", error);
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
