/**
 * Committee mail (direct communication) via Nodemailer + SMTP.
 * Separate from Resend (app/lib/email.server.ts) which handles reimbursement
 * requests and inbound reply webhooks.
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
 *      COMMITTEE_FROM_EMAIL, COMMITTEE_FROM_NAME (optional)
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface CommitteeMailConfig {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	fromEmail: string;
	fromName: string;
}

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 15000;

const config: CommitteeMailConfig = {
	host: process.env.SMTP_HOST || "",
	port: Number(process.env.SMTP_PORT) || 587,
	secure: process.env.SMTP_SECURE === "true",
	user: process.env.SMTP_USER || "",
	pass: process.env.SMTP_PASS || "",
	fromEmail: process.env.COMMITTEE_FROM_EMAIL || "",
	fromName: process.env.COMMITTEE_FROM_NAME || process.env.SITE_NAME || "Committee",
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth:
				config.user && config.pass
					? { user: config.user, pass: config.pass }
					: undefined,
			connectionTimeout: SMTP_TIMEOUT_MS,
			greetingTimeout: SMTP_TIMEOUT_MS,
			socketTimeout: SMTP_TIMEOUT_MS,
		});
	}
	return transporter;
}

/**
 * Check if committee mail (Nodemailer/SMTP) is configured.
 */
export function isCommitteeMailConfigured(): boolean {
	return !!(config.host && config.fromEmail);
}

export interface CommitteeMailRecipient {
	email: string;
	name?: string;
}

export interface CommitteeMailResult {
	success: boolean;
	error?: string;
	messageId?: string;
}

export interface CommitteeMailAttachment {
	filename: string;
	content: string;
	contentType?: string;
}

/**
 * Send one committee email with To, CC, and BCC.
 * Uses COMMITTEE_FROM_EMAIL and COMMITTEE_FROM_NAME as sender.
 */
export async function sendCommitteeEmail({
	to,
	cc,
	bcc,
	subject,
	html,
	inReplyTo,
	references,
	replyTo,
	attachments,
}: {
	to: CommitteeMailRecipient[];
	cc?: CommitteeMailRecipient[];
	bcc?: CommitteeMailRecipient[];
	subject: string;
	html: string;
	inReplyTo?: string;
	references?: string[];
	replyTo?: string;
	attachments?: CommitteeMailAttachment[];
}): Promise<CommitteeMailResult> {
	if (!isCommitteeMailConfigured()) {
		return {
			success: false,
			error: "Committee mail is not configured (SMTP / COMMITTEE_FROM_EMAIL)",
		};
	}

	const transport = getTransporter();
	const from = config.fromName?.trim()
		? `"${config.fromName}" <${config.fromEmail}>`
		: config.fromEmail;

	const formatAddress = (r: CommitteeMailRecipient) =>
		r.name ? `"${r.name}" <${r.email}>` : r.email;

	try {
		const info = await transport.sendMail({
			from,
			to: to.map(formatAddress),
			cc: cc?.length ? cc.map(formatAddress) : undefined,
			bcc: bcc?.length ? bcc.map(formatAddress) : undefined,
			replyTo: replyTo || undefined,
			subject,
			html,
			attachments: attachments?.length
				? attachments.map((attachment) => ({
						filename: attachment.filename,
						content: attachment.content,
						encoding: "base64",
						contentType: attachment.contentType,
				  }))
				: undefined,
			...(inReplyTo && { inReplyTo }),
			...(references?.length && { references: references.join(" ") }),
		});
		return { success: true, messageId: info.messageId };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { success: false, error: message };
	}
}
