/**
 * Email utility for sending purchase reimbursement requests
 * Uses Resend for email delivery
 * 
 * Required env vars:
 * - RESEND_API_KEY: API key from Resend
 * - SENDER_EMAIL: Email address to send from (must be verified in Resend)
 * - RECIPIENT_EMAIL: Building owner email to receive reimbursement requests
 */

import { Resend } from "resend";

interface EmailConfig {
    resendApiKey: string;
    senderEmail: string;
    recipientEmail: string;
}

const emailConfig: EmailConfig = {
    resendApiKey: process.env.RESEND_API_KEY || "",
    senderEmail: process.env.SENDER_EMAIL || "onboarding@resend.dev",
    recipientEmail: process.env.RECIPIENT_EMAIL || "",
};

console.log("[Email Config]", {
    resendApiKey: emailConfig.resendApiKey ? "SET" : "MISSING",
    senderEmail: emailConfig.senderEmail,
    recipientEmail: emailConfig.recipientEmail || "MISSING",
});

interface ReimbursementEmailData {
    itemName: string;
    itemValue: string;
    purchaserName: string;
    bankAccount: string;
    minutesReference: string;
    notes?: string;
}

interface EmailAttachment {
    name: string;
    type: string;
    content: string; // base64
}

/**
 * Send reimbursement request email with receipt and minutes attachments
 */
export async function sendReimbursementEmail(
    data: ReimbursementEmailData,
    receiptFile?: EmailAttachment,
    minutesFile?: EmailAttachment
): Promise<boolean> {
    if (!emailConfig.recipientEmail) {
        console.error("[sendReimbursementEmail] Missing RECIPIENT_EMAIL");
        return false;
    }

    if (!emailConfig.resendApiKey) {
        console.error("[sendReimbursementEmail] Missing RESEND_API_KEY");
        return false;
    }

    try {
        const resend = new Resend(emailConfig.resendApiKey);

        const subject = `Kulukorvaus / Reimbursement: ${data.itemName} (${data.itemValue} €)`;

        const htmlBody = `
            <h2>Kulukorvaus / Reimbursement Request</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tavara / Item:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.itemName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Summa / Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.itemValue} €</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Ostaja / Purchaser:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.purchaserName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tilinumero / Bank Account:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.bankAccount}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Pöytäkirja / Minutes:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.minutesReference}</td></tr>
                ${data.notes ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Lisätiedot / Notes:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.notes}</td></tr>` : ""}
            </table>
            <p style="margin-top: 16px; color: #666;">Liitteet / Attachments: Kuitti${minutesFile ? " + Pöytäkirja" : ""}</p>
        `;

        const attachments: { filename: string; content: string }[] = [];

        if (receiptFile) {
            attachments.push({
                filename: receiptFile.name,
                content: receiptFile.content,
            });
        }

        if (minutesFile) {
            attachments.push({
                filename: minutesFile.name,
                content: minutesFile.content,
            });
        }

        const { error } = await resend.emails.send({
            from: emailConfig.senderEmail,
            to: emailConfig.recipientEmail,
            subject,
            html: htmlBody,
            attachments: attachments.length > 0 ? attachments : undefined,
        });

        if (error) {
            console.error("[sendReimbursementEmail] Resend Error:", error);
            return false;
        }

        console.log(`[sendReimbursementEmail] Successfully sent email for: ${data.itemName}`);
        return true;
    } catch (error) {
        console.error("[sendReimbursementEmail] Error:", error);
        return false;
    }
}

/**
 * Check if email is configured
 */
export function isEmailConfigured(): boolean {
    return !!(emailConfig.resendApiKey && emailConfig.recipientEmail);
}
