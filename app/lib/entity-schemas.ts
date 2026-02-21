import type { DatabaseAdapter } from "~/db";
import type { RelationshipEntityType } from "~/db/types";
import {
	ENTITY_DEFINITIONS,
	type EntityDefinition,
	type FieldConfig,
	type RelationshipConfig,
} from "./entity-definitions";

export type { FieldConfig, RelationshipConfig };

/**
 * Entity schema configuration
 * Defines how to extract fields, validate, and perform CRUD operations for each entity type
 */
export interface EntitySchema<T = any> extends EntityDefinition {
	/** Fetch entity by ID */
	fetchById: (db: DatabaseAdapter, id: string) => Promise<T | null>;

	/** Update entity */
	updateItem: (
		db: DatabaseAdapter,
		id: string,
		data: Partial<any>,
	) => Promise<T | null>;

	/** Delete entity */
	deleteItem: (db: DatabaseAdapter, id: string) => Promise<boolean>;

	/** Extract fields from FormData for update */
	extractFields: (formData: FormData) => Record<string, any>;
}

export const ENTITY_SCHEMAS: Record<RelationshipEntityType, EntitySchema> = {
	faq: {
		...ENTITY_DEFINITIONS.faq,
		fetchById: (db, id) => db.getFaqById(id),
		updateItem: (db, id, data) => db.updateFaq(id, data),
		deleteItem: (db, id) => db.deleteFaq(id),
		extractFields: (formData) => ({
			question: (formData.get("question") as string)?.trim(),
			answer: (formData.get("answer") as string)?.trim(),
			questionSecondary:
				(formData.get("questionSecondary") as string)?.trim() || null,
			answerSecondary:
				(formData.get("answerSecondary") as string)?.trim() || null,
			sortOrder: Number.parseInt(
				(formData.get("sortOrder") as string) || "0",
				10,
			),
		}),
	},

	news: {
		...ENTITY_DEFINITIONS.news,
		fetchById: (db, id) => db.getNewsById(id),
		updateItem: (db, id, data) => db.updateNews(id, data),
		deleteItem: (db, id) => db.deleteNews(id),
		extractFields: (formData) => ({
			title: (formData.get("title") as string)?.trim(),
			summary: (formData.get("summary") as string)?.trim() || null,
			content: (formData.get("content") as string)?.trim(),
			titleSecondary:
				(formData.get("titleSecondary") as string)?.trim() || null,
			summarySecondary:
				(formData.get("summarySecondary") as string)?.trim() || null,
			contentSecondary:
				(formData.get("contentSecondary") as string)?.trim() || null,
		}),
	},

	minute: {
		...ENTITY_DEFINITIONS.minute,
		fetchById: (db, id) => db.getMinuteById(id),
		updateItem: (db, id, data) => db.updateMinute(id, data),
		deleteItem: (db, id) => db.deleteMinute(id),
		extractFields: (formData) => ({
			title: (formData.get("title") as string)?.trim(),
			description: (formData.get("description") as string)?.trim() || null,
			date: formData.get("date") as string,
			status: (formData.get("status") as string) || "draft",
		}),
	},

	budget: {
		...ENTITY_DEFINITIONS.budget,
		fetchById: (db, id) => db.getFundBudgetById(id),
		updateItem: (db, id, data) => db.updateFundBudget(id, data),
		deleteItem: (db, id) => db.deleteFundBudget(id),
		extractFields: (formData) => {
			const name = formData.get("name") as string;
			const description = formData.get("description") as string;
			const amountStr = formData.get("amount") as string;
			const newAmount = Number.parseFloat(amountStr.replace(",", "."));

			return {
				name,
				description: description || null,
				amount: newAmount.toFixed(2),
			};
		},
	},

	transaction: {
		...ENTITY_DEFINITIONS.transaction,
		fetchById: (db, id) => db.getTransactionById(id),
		updateItem: (db, id, data) => db.updateTransaction(id, data),
		deleteItem: (db, id) => db.deleteTransaction(id),
		extractFields: (formData) => ({
			description: (formData.get("description") as string)?.trim(),
			amount: formData.get("amount") as string,
			status: formData.get("status") as string,
			reimbursementStatus: formData.get("reimbursementStatus") as string,
			notes: (formData.get("notes") as string)?.trim() || null,
		}),
	},

	reimbursement: {
		...ENTITY_DEFINITIONS.reimbursement,
		fetchById: (db, id) => db.getPurchaseById(id),
		updateItem: (db, id, data) => db.updatePurchase(id, data),
		deleteItem: (db, id) => db.deletePurchase(id),
		extractFields: (formData) => {
			const purchaserName = formData.get("purchaserName") as string;
			const bankAccount = formData.get("bankAccount") as string;
			const minutesInfo = formData.get("minutesId") as string;
			const [minutesId, minutesName] = (minutesInfo || "").includes("|")
				? minutesInfo.split("|")
				: [minutesInfo, ""];
			const notes = formData.get("notes") as string;
			const amount = formData.get("amount") as string;
			const description = formData.get("description") as string;

			return {
				purchaserName,
				bankAccount,
				minutesId: minutesId || undefined,
				minutesName: minutesName || undefined,
				notes: notes || undefined,
				amount,
				description,
			};
		},
	},

	receipt: {
		...ENTITY_DEFINITIONS.receipt,
		fetchById: (db, id) => db.getReceiptById(id),
		updateItem: (db, id, data) => db.updateReceipt(id, data),
		deleteItem: (db, id) => db.deleteReceipt(id),
		extractFields: (formData) => ({
			name: (formData.get("name") as string)?.trim(),
			description: (formData.get("description") as string)?.trim() || null,
			// Receipt update is more complex (file upload, OCR), handled separately
		}),
	},

	inventory: {
		...ENTITY_DEFINITIONS.inventory,
		fetchById: (db, id) => db.getInventoryItemById(id),
		updateItem: (db, id, data) => db.updateInventoryItem(id, data),
		deleteItem: (db, id) => db.deleteInventoryItem(id),
		extractFields: (formData) => ({
			name: (formData.get("name") as string)?.trim(),
			quantity: Number.parseInt(
				(formData.get("quantity") as string) || "1",
				10,
			),
			location: (formData.get("location") as string)?.trim() || null,
			category: (formData.get("category") as string)?.trim() || null,
			description: (formData.get("description") as string)?.trim() || null,
			purchasedAt: formData.get("purchasedAt")
				? new Date(formData.get("purchasedAt") as string)
				: null,
			showInInfoReel:
				formData.get("showInInfoReel") === "true" ||
				formData.get("showInInfoReel") === "on",
		}),
	},

	poll: {
		...ENTITY_DEFINITIONS.poll,
		fetchById: (db, id) => db.getPollById(id),
		updateItem: (db, id, data) => db.updatePoll(id, data),
		deleteItem: (db, id) => db.deletePoll(id),
		extractFields: (formData) => {
			const status = formData.get("status") as string;
			const analyticsSheetId = formData.get("analyticsSheetId") as string;
			const deadlineDate = formData.get("deadlineDate") as string;
			const deadlineTime = formData.get("deadlineTime") as string;

			let deadline: Date | null = null;
			if (deadlineDate && deadlineTime) {
				deadline = new Date(`${deadlineDate}T${deadlineTime}`);
			}

			const data: any = {
				status,
				analyticsSheetId:
					analyticsSheetId === "none" || !analyticsSheetId
						? null
						: analyticsSheetId,
				deadline,
			};

			const name = formData.get("name") as string;
			if (name !== null) {
				data.name = name.trim();
			}

			const description = formData.get("description") as string;
			if (description !== null) {
				data.description = description.trim() || null;
			}

			const externalUrl = formData.get("externalUrl") as string;
			if (externalUrl !== null) {
				data.externalUrl = externalUrl.trim();
			}

			return data;
		},
	},

	event: {
		...ENTITY_DEFINITIONS.event,
		fetchById: async (db, id) => {
			return null;
		},
		updateItem: async () => null,
		deleteItem: async () => false,
		extractFields: () => ({}),
	},
	social: {
		...ENTITY_DEFINITIONS.social,
		fetchById: async () => null,
		updateItem: async () => null,
		deleteItem: async () => false,
		extractFields: () => ({}),
	} as any,
	mail: {
		...ENTITY_DEFINITIONS.mail,
		fetchById: (db, id) => db.getMailDraftById(id),
		updateItem: (db, id, data) => db.updateMailDraft(id, data),
		deleteItem: (db, id) => db.deleteMailDraft(id),
		extractFields: (formData) => ({
			toJson: (formData.get("to_json") as string) ?? "[]",
			ccJson: (formData.get("cc_json") as string) || null,
			bccJson: (formData.get("bcc_json") as string) || null,
			subject: (formData.get("subject") as string) ?? null,
			body: (formData.get("body") as string) ?? null,
		}),
	},
	submission: {
		...ENTITY_DEFINITIONS.submission,
		fetchById: (db, id) => db.getSubmissionById(id),
		updateItem: (db, id, data) => db.updateSubmission(id, data),
		deleteItem: (db, id) => db.deleteSubmission(id),
		extractFields: (formData) => ({
			name: formData.get("name") as string,
			email: formData.get("email") as string,
			apartmentNumber: (formData.get("apartmentNumber") as string) || null,
			type: formData.get("type") as string,
			message: formData.get("message") as string,
			status: formData.get("status") as string,
		}),
	},
};
