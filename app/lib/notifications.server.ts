/**
 * Notification helper functions for creating in-app messages and sending email notifications
 */

import type { DatabaseAdapter, Purchase, User } from "~/db";
import { sendReimbursementStatusEmail, bilingualText } from "./email.server";

interface NotificationResult {
	success: boolean;
	error?: string;
}

/**
 * Create a reimbursement status notification (in-app message + email)
 * Called when a reimbursement request is approved or declined
 */
export async function createReimbursementStatusNotification(
	purchase: Purchase,
	newStatus: "approved" | "rejected" | "reimbursed",
	db: DatabaseAdapter,
): Promise<NotificationResult> {
	// Only send notifications for approved or rejected status
	if (newStatus !== "approved" && newStatus !== "rejected") {
		return { success: true };
	}

	// Get the user who created the purchase
	if (!purchase.createdBy) {
		console.log(
			`[createReimbursementStatusNotification] Purchase ${purchase.id} has no createdBy, skipping notification`,
		);
		return { success: true };
	}

	const user = await db.findUserById(purchase.createdBy);
	if (!user) {
		console.error(
			`[createReimbursementStatusNotification] User ${purchase.createdBy} not found for purchase ${purchase.id}`,
		);
		return { success: false, error: "User not found" };
	}

	// Determine message type and status key
	const messageType = newStatus === "approved" ? "reimbursement_approved" : "reimbursement_declined";
	const statusKey = newStatus === "approved" ? "approved" : "declined";

	// Get bilingual text using user's language preferences
	const t = (key: string) =>
		bilingualText(user.primaryLanguage, user.secondaryLanguage, key);

	// Create message title and content
	const title = t(`messages.reimbursement_${statusKey}.title`);
	const content = t(`messages.reimbursement_${statusKey}.content`)
		.replace("{description}", purchase.description || t("messages.unknown_item"))
		.replace("{amount}", purchase.amount);

	// Create in-app message
	try {
		await db.createMessage({
			userId: user.id,
			type: messageType,
			title,
			content,
			relatedPurchaseId: purchase.id,
			read: false,
		});
	} catch (error) {
		console.error(
			`[createReimbursementStatusNotification] Failed to create message:`,
			error,
		);
		return { success: false, error: "Failed to create message" };
	}

	// Send email notification if user has an email
	if (user.email) {
		try {
			const emailResult = await sendReimbursementStatusEmail(
				user.email,
				user.primaryLanguage,
				user.secondaryLanguage,
				purchase.description || t("messages.unknown_item"),
				purchase.amount,
				statusKey,
				purchase.id,
			);

			if (!emailResult.success) {
				console.error(
					`[createReimbursementStatusNotification] Failed to send email:`,
					emailResult.error,
				);
				// Don't fail the whole operation if email fails - message was created
			}
		} catch (error) {
			console.error(
				`[createReimbursementStatusNotification] Email error:`,
				error,
			);
			// Don't fail the whole operation if email fails - message was created
		}
	}

	return { success: true };
}
