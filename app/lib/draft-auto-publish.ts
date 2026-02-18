import type { RelationshipEntityType } from "~/db/types";

/**
 * Determines the appropriate "published" status for an entity type
 * when transitioning from draft. Each entity type has its own default active status.
 */
function getPublishedStatus(type: RelationshipEntityType): string | null {
	switch (type) {
		case "transaction":
			return "pending";
		case "receipt":
			return "active";
		case "reimbursement":
			return "pending";
		case "budget":
			return "open";
		case "inventory":
			return "active";
		case "minute":
			return "active";
		case "social":
			return "active";
		case "news":
			return "active";
		case "faq":
			return "active";
		case "poll":
			return "active";
		case "mail":
			return "sent";
		default:
			return null;
	}
}

/**
 * Defines required fields for each entity type. If all these fields
 * are filled (non-empty, non-zero), the entity can be published.
 */
type RequiredFieldsCheck = Record<string, unknown>;

/**
 * Check if a transaction draft should be auto-published.
 * Required: description, amount > 0
 */
function isTransactionReady(fields: RequiredFieldsCheck): boolean {
	const description = String(fields.description || "").trim();
	const amount = Number.parseFloat(String(fields.amount || "0"));
	return description.length > 0 && amount > 0;
}

/**
 * Check if a receipt draft should be auto-published.
 * Required: name
 */
function isReceiptReady(fields: RequiredFieldsCheck): boolean {
	const name = String(fields.name || "").trim();
	return name.length > 0;
}

/**
 * Check if a reimbursement draft should be auto-published.
 * Required: description, amount > 0, purchaserName, bankAccount
 */
function isReimbursementReady(fields: RequiredFieldsCheck): boolean {
	const description = String(fields.description || "").trim();
	const amount = Number.parseFloat(String(fields.amount || "0"));
	const purchaserName = String(fields.purchaserName || "").trim();
	const bankAccount = String(fields.bankAccount || "").trim();
	return (
		description.length > 0 &&
		amount > 0 &&
		purchaserName.length > 0 &&
		bankAccount.length > 0
	);
}

/**
 * Check if a budget draft should be auto-published.
 * Required: name, amount > 0
 */
function isBudgetReady(fields: RequiredFieldsCheck): boolean {
	const name = String(fields.name || "").trim();
	const amount = Number.parseFloat(
		String(fields.amount || "0").replace(",", "."),
	);
	return name.length > 0 && amount > 0;
}

/**
 * Check if an inventory draft should be auto-published.
 * Required: name, location
 */
function isInventoryReady(fields: RequiredFieldsCheck): boolean {
	const name = String(fields.name || "").trim();
	const location = String(fields.location || "").trim();
	return name.length > 0 && location.length > 0;
}

/**
 * Check if a minute draft should be auto-published.
 * Required: title, date
 */
function isMinuteReady(fields: RequiredFieldsCheck): boolean {
	const title = String(fields.title || "").trim();
	const date = fields.date;
	return title.length > 0 && !!date;
}

/**
 * Check if a social draft should be auto-published.
 * Required: name, url
 */
function isSocialReady(fields: RequiredFieldsCheck): boolean {
	const name = String(fields.name || "").trim();
	const url = String(fields.url || "").trim();
	return name.length > 0 && url.length > 0;
}

/**
 * Check if a news draft should be auto-published.
 * Required: title, content
 */
function isNewsReady(fields: RequiredFieldsCheck): boolean {
	const title = String(fields.title || "").trim();
	const content = String(fields.content || "").trim();
	return title.length > 0 && content.length > 0;
}

/**
 * Check if an FAQ draft should be auto-published.
 * Required: question, answer
 */
function isFaqReady(fields: RequiredFieldsCheck): boolean {
	const question = String(fields.question || "").trim();
	const answer = String(fields.answer || "").trim();
	return question.length > 0 && answer.length > 0;
}

/**
 * Check if a poll draft should be auto-published.
 * Required: name
 */
function isPollReady(fields: RequiredFieldsCheck): boolean {
	const name = String(fields.name || "").trim();
	return name.length > 0;
}

/**
 * Check if an event draft should be auto-published.
 * Required: title (summary)
 */
function isEventReady(fields: RequiredFieldsCheck): boolean {
	const title = String(fields.title || fields.summary || "").trim();
	return title.length > 0;
}

/**
 * Check if a mail draft should be auto-published (sent).
 * Required: subject, body, and at least one recipient in toJson
 */
function isMailReady(fields: RequiredFieldsCheck): boolean {
	const subject = String(fields.subject || "").trim();
	const body = String(fields.body || "").trim();
	const toJson = String(fields.toJson || "[]");
	return subject.length > 0 && body.length > 0 && toJson.includes("@");
}

/**
 * Determines the new status for a draft entity based on whether
 * all required fields are filled. Returns null if the entity is
 * not a draft or shouldn't be auto-published.
 *
 * @param entityType - The entity type (transaction, receipt, etc.)
 * @param currentStatus - The current status of the entity
 * @param fields - An object containing the relevant field values to check
 * @returns The new status string, or null if no change should be made
 */
export function getDraftAutoPublishStatus(
	entityType: RelationshipEntityType,
	currentStatus: string,
	fields: Record<string, unknown>,
): string | null {
	// Only auto-publish from draft status
	if (currentStatus !== "draft") {
		return null;
	}

	const publishedStatus = getPublishedStatus(entityType);
	if (!publishedStatus) {
		return null;
	}

	let isReady = false;

	switch (entityType) {
		case "transaction":
			isReady = isTransactionReady(fields);
			break;
		case "receipt":
			isReady = isReceiptReady(fields);
			break;
		case "reimbursement":
			isReady = isReimbursementReady(fields);
			break;
		case "budget":
			isReady = isBudgetReady(fields);
			break;
		case "inventory":
			isReady = isInventoryReady(fields);
			break;
		case "minute":
			isReady = isMinuteReady(fields);
			break;
		case "social":
			isReady = isSocialReady(fields);
			break;
		case "news":
			isReady = isNewsReady(fields);
			break;
		case "faq":
			isReady = isFaqReady(fields);
			break;
		case "poll":
			isReady = isPollReady(fields);
			break;
		case "event":
			isReady = isEventReady(fields);
			break;
		case "mail":
			isReady = isMailReady(fields);
			break;
		default:
			return null;
	}

	return isReady ? publishedStatus : null;
}
