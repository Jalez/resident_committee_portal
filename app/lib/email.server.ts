/**
 * Email utility for sending purchase reimbursement requests.
 * Uses app SMTP mail (committee mailbox) and IMAP for inbound replies.
 *
 * Required env vars:
 * - RECIPIENT_EMAIL: Building owner email to receive reimbursement requests
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, COMMITTEE_FROM_EMAIL
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseAdapter } from "~/db/adapters/types";
import { getDatabase } from "~/db/server.server";
import { getFileAsBase64 } from "./google.server";
import {
	type CommitteeMailAttachment,
	isCommitteeMailConfigured,
	sendCommitteeEmail,
} from "./mail-nodemailer.server";
import { computeThreadId } from "./mail-threading.server";
import { getMinuteStorage } from "./minutes/storage.server";
import { SETTINGS_KEYS } from "./openrouter.server";
import { getReceiptContentBase64 } from "./receipts/server";
import { getSystemLanguageDefaults } from "./settings.server";

interface ReimbursementEmailConfig {
	recipientEmail: string;
	replyToEmail: string;
}

const reimbursementConfig: ReimbursementEmailConfig = {
	recipientEmail: process.env.RECIPIENT_EMAIL || "",
	replyToEmail: process.env.COMMITTEE_FROM_EMAIL || "",
};

const REIMBURSEMENT_SUBJECT_TAG = "Reimbursement";
const REIMBURSEMENT_SUBJECT_REGEX =
	/\[Reimbursement\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

async function getReimbursementRecipientEmail(): Promise<string> {
	const db = getDatabase();
	const setting = await db.getSetting(
		SETTINGS_KEYS.REIMBURSEMENT_RECIPIENT_EMAIL,
	);
	return setting?.trim() || reimbursementConfig.recipientEmail;
}

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
	} catch (_error) {
		console.warn(
			`[loadTranslations] Failed to load ${lang}, falling back to fi`,
		);
		if (lang !== "fi") {
			return loadTranslations("fi");
		}
		return {};
	}
}

/**
 * Get a nested translation value
 */
function getTranslation(
	translations: Record<string, unknown>,
	key: string,
): string {
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
 * Get translation in a single language (for in-app messages, etc.)
 */
export function primaryText(lang: string, key: string): string {
	const translations = loadTranslations(lang);
	return getTranslation(translations, key);
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
 * Build a subject with a reimbursement tag for reply mapping.
 */
export function buildReimbursementSubject(
	baseSubject: string,
	purchaseId: string,
): string {
	return `[${REIMBURSEMENT_SUBJECT_TAG} ${purchaseId}] ${baseSubject}`;
}

/**
 * Extract purchase ID from a tagged subject.
 */
export function extractPurchaseIdFromSubject(subject: string): string | null {
	const match = subject.match(REIMBURSEMENT_SUBJECT_REGEX);
	return match ? match[1] : null;
}

/**
 * Extract purchase ID from any reimbursement marker inside text content.
 */
export function extractPurchaseIdFromContent(content: string): string | null {
	const match = content.match(
		/\bReimbursement\s+ID\s*[:#]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
	);
	return match ? match[1] : null;
}

/**
 * Extract purchase ID from a reply-to address (optional plus-addressing).
 */
export function extractPurchaseIdFromEmail(toAddress: string): string | null {
	const match = toAddress.match(
		/\breimbursement[-+]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i,
	);
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

	const normalizeReplyContent = (raw: string): string => {
		const normalized = raw.replace(/\r\n/g, "\n").trim();
		if (!normalized) return "";

		const withoutQuotedLines = normalized
			.split("\n")
			.filter((line) => !line.trimStart().startsWith(">"))
			.join("\n");

		const splitMarkers = [
			/^On .+ wrote:\s*$/im,
			/^-----Original Message-----\s*$/im,
			/^From:\s.+$/im,
			/^_{2,}\s*$/m,
			/^Sent from my /im,
		];

		let primarySegment = withoutQuotedLines;
		for (const marker of splitMarkers) {
			const match = marker.exec(primarySegment);
			if (match?.index !== undefined && match.index >= 0) {
				primarySegment = primarySegment.slice(0, match.index);
				break;
			}
		}

		const cleaned = primarySegment.trim();
		return cleaned || normalized;
	};

	const decisionContent = normalizeReplyContent(content);
	if (!decisionContent) return "unclear";

	const lowerContent = decisionContent.toLowerCase();

	// First, try AI parsing if enabled
	const aiConfig = await isAIParsingEnabled();
	if (aiConfig.enabled && aiConfig.apiKey && aiConfig.model) {
		console.log("[Email] Attempting AI parsing with model:", aiConfig.model);
		const aiDecision = await parseReplyWithAI(
			decisionContent,
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
 * Receipt files are stored in external storage and attached when available.
 * Uses app's default language settings for bilingual email content.
 */
export async function sendReimbursementEmail(
	data: ReimbursementEmailData,
	purchaseId: string,
	minutesFile?: EmailAttachment | EmailAttachment[],
	receiptFiles?: EmailAttachment[],
	db?: DatabaseAdapter,
): Promise<SendEmailResult> {
	const recipientEmail = await getReimbursementRecipientEmail();
	if (!recipientEmail) {
		console.error("[sendReimbursementEmail] Missing RECIPIENT_EMAIL");
		return { success: false, error: "Missing RECIPIENT_EMAIL" };
	}

	if (!isCommitteeMailConfigured()) {
		console.error("[sendReimbursementEmail] Committee mail not configured");
		return {
			success: false,
			error: "Committee mail is not configured (SMTP / COMMITTEE_FROM_EMAIL)",
		};
	}

	// Get app's default language settings
	const systemLanguages = await getSystemLanguageDefaults();
	const primaryLang = systemLanguages.primary;
	const secondaryLang = systemLanguages.secondary;

	// Helper to get bilingual text
	const t = (key: string) => bilingualText(primaryLang, secondaryLang, key);

	try {
		const baseSubject = `${t("email.reimbursement.subject")}: ${data.itemName} (${data.itemValue} €)`;
		const subject = buildReimbursementSubject(baseSubject, purchaseId);

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

		const reimbursementIdHtml = `<p style="margin-top: 12px; color: #888; font-size: 12px;">Reimbursement ID: ${purchaseId}</p>`;

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
			<p style="margin-top: 16px; color: #888; font-size: 12px;">${t("email.reimbursement.reply_instruction")}</p>
			${reimbursementIdHtml}
        `;

		const attachments: CommitteeMailAttachment[] = [];

		const minutesFiles = Array.isArray(minutesFile)
			? minutesFile
			: minutesFile
				? [minutesFile]
				: [];

		for (const minuteFile of minutesFiles) {
			attachments.push({
				filename: minuteFile.name,
				content: minuteFile.content,
				contentType: minuteFile.type,
			});
		}

		if (receiptFiles && receiptFiles.length > 0) {
			for (const receipt of receiptFiles) {
				attachments.push({
					filename: receipt.name,
					content: receipt.content,
					contentType: receipt.type,
				});
			}
		}

		const result = await sendCommitteeEmail({
			to: [{ email: recipientEmail }],
			subject,
			html: htmlBody,
			replyTo: reimbursementConfig.replyToEmail || undefined,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		if (!result.success) {
			console.error("[sendReimbursementEmail] SMTP Error:", result.error);
			return { success: false, error: result.error };
		}

		if (db) {
			const fromEmail = process.env.COMMITTEE_FROM_EMAIL || "";
			const fromName =
				process.env.COMMITTEE_FROM_NAME || process.env.SITE_NAME || "Committee";
			const toJson = JSON.stringify([{ email: recipientEmail }]);
			const threadId = computeThreadId(result.messageId || null, null, null);
			await db.insertCommitteeMailMessage({
				direction: "sent",
				fromAddress: fromEmail,
				fromName: fromName || null,
				toJson,
				ccJson: null,
				bccJson: null,
				subject,
				bodyHtml: htmlBody,
				bodyText: null,
				date: new Date(),
				messageId: result.messageId || null,
				inReplyTo: null,
				referencesJson: null,
				threadId,
			});
		}

		console.log(
			`[sendReimbursementEmail] Successfully sent email for: ${data.itemName}, messageId: ${result.messageId}`,
		);
		return {
			success: true,
			messageId: result.messageId,
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

	if (!isCommitteeMailConfigured()) {
		console.error(
			"[sendReimbursementStatusEmail] Committee mail not configured",
		);
		return {
			success: false,
			error: "Committee mail is not configured (SMTP / COMMITTEE_FROM_EMAIL)",
		};
	}

	// Use test email in dev mode if configured, otherwise use user's email
	const recipientEmail = isDev && testEmail ? testEmail : userEmail;

	// Helper to get bilingual text using user's language preferences
	const t = (key: string) =>
		bilingualText(userPrimaryLanguage, userSecondaryLanguage, key);

	try {
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

		const result = await sendCommitteeEmail({
			to: [{ email: recipientEmail }],
			subject,
			html: htmlBody,
		});

		if (!result.success) {
			console.error("[sendReimbursementStatusEmail] SMTP Error:", result.error);
			return { success: false, error: result.error };
		}

		console.log(
			`[sendReimbursementStatusEmail] Successfully sent status email to ${recipientEmail} for purchase ${purchaseId}, messageId: ${result.messageId}`,
		);
		return {
			success: true,
			messageId: result.messageId,
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
 * Build attachments for receipt links by downloading files from receipt storage
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
				const content = await getReceiptContentBase64(receipt);
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

	// Try to find in DB first (UUID)
	// UUID regex check? Or just try fetch
	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			minutesId,
		);

	if (isUuid) {
		try {
			const db = getDatabase();
			const minute = await db.getMinuteById(minutesId);
			if (minute?.fileUrl && minute.fileKey) {
				const storage = getMinuteStorage();
				const content = await storage.getMinuteContentBase64(minute.fileUrl);
				if (content) {
					const filename = minute.fileKey.split("/").pop() || "minute.pdf";
					const type = filename.endsWith(".pdf")
						? "application/pdf"
						: "application/octet-stream";
					return {
						name: filename,
						type,
						content,
					};
				}
			}
		} catch (e) {
			console.error(
				"[buildMinutesAttachment] DB fetch failed, falling back to Google",
				e,
			);
		}
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
export async function isEmailConfigured(): Promise<boolean> {
	const recipientEmail = await getReimbursementRecipientEmail();
	return !!(recipientEmail && isCommitteeMailConfigured());
}

/**
 * Check if inbound email is configured
 */
export function isInboundEmailConfigured(): boolean {
	return !!(process.env.IMAP_HOST && process.env.IMAP_USER);
}

/**
 * Get the webhook secret for signature verification
 */
export function getWebhookSecret(): string {
	return process.env.RESEND_WEBHOOK_SECRET || "";
}
