import { Resend } from "resend";
import { getDatabase } from "~/db";
import {
	extractPurchaseIdFromEmail,
	getWebhookSecret,
	parseReimbursementReply,
} from "~/lib/email.server";
import type { Route } from "./+types/api.webhooks.resend";

/**
 * Resend Webhook Endpoint
 * Handles inbound email events for processing reimbursement replies
 *
 * Required webhook configuration in Resend dashboard:
 * - Event: email.received
 * - Endpoint: https://your-domain.com/api/webhooks/resend
 */

interface ResendEmailReceivedEvent {
	type: "email.received";
	created_at: string;
	data: {
		email_id: string;
		from: string;
		to: string[];
		cc: string[];
		bcc: string[];
		subject: string;
		message_id: string;
		text?: string; // Plain text body
		html?: string; // HTML body
		attachments: Array<{
			id: string;
			filename: string;
			content_type: string;
		}>;
	};
}

/**
 * Action handler for Resend webhooks
 */
export async function action({ request }: Route.ActionArgs) {
	// Only accept POST requests
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	try {
		const webhookSecret = getWebhookSecret();

		// Verify webhook signature if secret is configured
		if (webhookSecret) {
			const svixId = request.headers.get("svix-id");
			const svixTimestamp = request.headers.get("svix-timestamp");
			const svixSignature = request.headers.get("svix-signature");

			if (!svixId || !svixTimestamp || !svixSignature) {
				console.error("[Resend Webhook] Missing Svix headers");
				return new Response("Missing signature headers", { status: 401 });
			}

			// Get raw body for signature verification
			const rawBody = await request.text();

			try {
				const resend = new Resend(process.env.RESEND_API_KEY || "");
				resend.webhooks.verify({
					payload: rawBody,
					headers: {
						id: svixId,
						timestamp: svixTimestamp,
						signature: svixSignature,
					},
					webhookSecret,
				});
			} catch (verifyError) {
				console.error(
					"[Resend Webhook] Signature verification failed:",
					verifyError,
				);
				return new Response("Invalid signature", { status: 401 });
			}

			// Parse the verified body
			const event = JSON.parse(rawBody) as ResendEmailReceivedEvent;
			return await processEmailEvent(event);
		} else {
			// No secret configured - still process but log warning
			console.warn(
				"[Resend Webhook] No webhook secret configured - skipping signature verification",
			);
			const event = (await request.json()) as ResendEmailReceivedEvent;
			return await processEmailEvent(event);
		}
	} catch (error) {
		console.error("[Resend Webhook] Error processing webhook:", error);
		return new Response("Internal server error", { status: 500 });
	}
}

/**
 * Process the email.received event
 */
async function processEmailEvent(event: ResendEmailReceivedEvent) {
	if (event.type !== "email.received") {
		console.log(
			`[Resend Webhook] Ignoring non-email.received event: ${event.type}`,
		);
		return new Response("OK", { status: 200 });
	}

	const { data } = event;
	console.log("[Resend Webhook] Processing email.received:", {
		from: data.from,
		to: data.to,
		subject: data.subject,
		hasText: !!data.text,
		textLength: data.text?.length,
		hasHtml: !!data.html,
		htmlLength: data.html?.length,
	});

	// Log actual text content if present
	if (data.text) {
		console.log("[Resend Webhook] Text content:", data.text.substring(0, 500));
	}
	if (data.html) {
		console.log(
			"[Resend Webhook] HTML content (first 200 chars):",
			data.html.substring(0, 200),
		);
	}

	// Extract purchase ID from the "to" address
	// Expected format: reimbursement-{uuid}@{domain}.resend.app
	let purchaseId: string | null = null;
	for (const toAddress of data.to) {
		const extracted = extractPurchaseIdFromEmail(toAddress);
		if (extracted) {
			purchaseId = extracted;
			break;
		}
	}

	if (!purchaseId) {
		console.log(
			"[Resend Webhook] No purchase ID found in to addresses:",
			data.to,
		);
		// Not a reimbursement reply, just acknowledge
		return new Response("OK", { status: 200 });
	}

	console.log(`[Resend Webhook] Found purchase ID: ${purchaseId}`);

	// Fetch email content from Resend API
	const db = getDatabase();
	const purchase = await db.getPurchaseById(purchaseId);

	if (!purchase) {
		console.error(`[Resend Webhook] Purchase not found: ${purchaseId}`);
		return new Response("Purchase not found", { status: 404 });
	}

	// Fetch email body content using Resend Receiving API
	// The webhook only includes metadata, not the body content
	let emailContent = data.subject || "";
	try {
		const resend = new Resend(process.env.RESEND_API_KEY || "");
		const emailData = await resend.emails.receiving.get(data.email_id);

		console.log(
			"[Resend Webhook] Full receiving API response:",
			JSON.stringify(emailData, null, 2),
		);

		// Use text body preferably, then HTML, then subject as fallback
		emailContent =
			emailData.data?.text || emailData.data?.html || data.subject || "";
	} catch (fetchError) {
		console.error(
			"[Resend Webhook] Failed to fetch email via receiving API:",
			fetchError,
		);
		// Fall back to subject only
	}

	console.log(
		`[Resend Webhook] Email content received:`,
		emailContent.substring(0, 200),
	);

	// Parse the reply content
	const decision = await parseReimbursementReply(emailContent);
	console.log(
		`[Resend Webhook] Parsed decision: ${decision} for purchase ${purchaseId}`,
	);

	// Update purchase based on decision
	try {
		const updateData: {
			emailReplyReceived: boolean;
			emailReplyContent: string;
			status?: "approved" | "rejected" | "pending";
		} = {
			emailReplyReceived: true,
			emailReplyContent: emailContent.substring(0, 1000), // Store first 1000 chars
		};

		if (decision === "approved") {
			updateData.status = "approved";
		} else if (decision === "rejected") {
			updateData.status = "rejected";
		}
		// For "unclear", keep current status but mark reply received

		await db.updatePurchase(purchaseId, updateData);

		// Also update the linked transaction's reimbursementStatus and status
		if (decision === "approved" || decision === "rejected") {
			const linkedTransaction = await db.getTransactionByPurchaseId(purchaseId);
			if (linkedTransaction) {
				const newReimbursementStatus =
					decision === "approved" ? "approved" : "declined";
				const newTransactionStatus =
					decision === "approved" ? "complete" : "declined";
				await db.updateTransaction(linkedTransaction.id, {
					reimbursementStatus: newReimbursementStatus,
					status: newTransactionStatus,
				});
				console.log(
					`[Resend Webhook] Updated transaction ${linkedTransaction.id} status to: ${newTransactionStatus}, reimbursementStatus to: ${newReimbursementStatus}`,
				);
			}
		}

		console.log(
			`[Resend Webhook] Updated purchase ${purchaseId} with decision: ${decision}`,
		);

		return new Response("OK", { status: 200 });
	} catch (updateError) {
		console.error("[Resend Webhook] Failed to update purchase:", updateError);
		return new Response("Failed to update purchase", { status: 500 });
	}
}

/**
 * Handle GET requests (for webhook endpoint verification)
 */
export function loader() {
	return new Response("Resend webhook endpoint", { status: 200 });
}
