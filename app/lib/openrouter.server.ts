/**
 * OpenRouter service for AI-assisted reply parsing
 * Uses @openrouter/ai-sdk-provider for model access
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { getDatabase } from "~/db";

// Setting keys for app_settings table
export const SETTINGS_KEYS = {
	OPENROUTER_API_KEY: "openrouter_api_key",
	AI_MODEL: "ai_model",
	AI_PARSING_ENABLED: "ai_parsing_enabled",
	APPROVAL_KEYWORDS: "approval_keywords",
	REJECTION_KEYWORDS: "rejection_keywords",
} as const;

// Default keywords (Finnish + English)
export const DEFAULT_APPROVAL_KEYWORDS = [
	"approved",
	"hyväksytty",
	"ok",
	"yes",
	"kyllä",
	"selvä",
	"maksetaan",
	"hyväksyn",
];

export const DEFAULT_REJECTION_KEYWORDS = [
	"rejected",
	"hylätty",
	"no",
	"denied",
	"ei",
];

export interface OpenRouterModel {
	id: string;
	name: string;
	description?: string;
	pricing: {
		prompt: number; // per 1M tokens
		completion: number; // per 1M tokens
	};
	context_length: number;
	architecture?: {
		instruction_type?: string;
	};
}

/**
 * Fetch available models from OpenRouter API
 * Filters to only chat/text models and sorts by price
 */
export async function getAvailableModels(
	apiKey: string,
): Promise<OpenRouterModel[]> {
	try {
		const response = await fetch("https://openrouter.ai/api/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			console.error("[OpenRouter] Failed to fetch models:", response.status);
			return [];
		}

		const data = await response.json();
		const models = data.data as Array<{
			id: string;
			name: string;
			description?: string;
			pricing: { prompt: string; completion: string };
			context_length: number;
			architecture?: { instruction_type?: string };
		}>;

		// Filter and transform models
		return models
			.filter((m) => m.pricing && m.context_length > 0)
			.map((m) => ({
				id: m.id,
				name: m.name,
				description: m.description,
				pricing: {
					prompt: parseFloat(m.pricing.prompt) * 1_000_000, // Convert to per 1M tokens
					completion: parseFloat(m.pricing.completion) * 1_000_000,
				},
				context_length: m.context_length,
				architecture: m.architecture,
			}))
			.sort((a, b) => a.pricing.prompt - b.pricing.prompt);
	} catch (error) {
		console.error("[OpenRouter] Error fetching models:", error);
		return [];
	}
}

/**
 * Parse reply using AI (OpenRouter)
 * Returns "approved", "rejected", or "unclear"
 */
export async function parseReplyWithAI(
	content: string,
	apiKey: string,
	modelId: string,
): Promise<"approved" | "rejected" | "unclear"> {
	try {
		const openrouter = createOpenRouter({
			apiKey,
		});

		const { text } = await generateText({
			model: openrouter(modelId),
			prompt: `You are analyzing an email reply to a reimbursement request. 
The recipient is responding to whether they approve or reject a purchase/expense.

Email content:
"""
${content}
"""

Based on the email content, classify the response as one of:
- "approved" - if the person approves, accepts, or grants the reimbursement
- "rejected" - if the person rejects, denies, or refuses the reimbursement
- "unclear" - if you cannot determine the intent

Reply with ONLY one word: approved, rejected, or unclear.`,
		});

		const decision = text.trim().toLowerCase();
		if (decision === "approved" || decision === "rejected") {
			return decision;
		}
		return "unclear";
	} catch (error) {
		console.error("[OpenRouter] AI parsing error:", error);
		return "unclear";
	}
}

/**
 * Get setting from database
 */
async function getSetting(key: string): Promise<string | null> {
	const db = getDatabase();
	return db.getSetting(key);
}

/**
 * Get custom keywords from database, merged with defaults
 */
export async function getKeywords(): Promise<{
	approval: string[];
	rejection: string[];
}> {
	const customApproval = await getSetting(SETTINGS_KEYS.APPROVAL_KEYWORDS);
	const customRejection = await getSetting(SETTINGS_KEYS.REJECTION_KEYWORDS);

	const approvalKeywords = [...DEFAULT_APPROVAL_KEYWORDS];
	const rejectionKeywords = [...DEFAULT_REJECTION_KEYWORDS];

	if (customApproval) {
		const custom = customApproval
			.split(",")
			.map((k) => k.trim().toLowerCase())
			.filter(Boolean);
		approvalKeywords.push(...custom);
	}

	if (customRejection) {
		const custom = customRejection
			.split(",")
			.map((k) => k.trim().toLowerCase())
			.filter(Boolean);
		rejectionKeywords.push(...custom);
	}

	return {
		approval: [...new Set(approvalKeywords)],
		rejection: [...new Set(rejectionKeywords)],
	};
}

/**
 * Check if AI parsing is enabled and configured
 */
export async function isAIParsingEnabled(): Promise<{
	enabled: boolean;
	apiKey?: string;
	model?: string;
}> {
	const enabled = await getSetting(SETTINGS_KEYS.AI_PARSING_ENABLED);
	if (enabled !== "true") {
		return { enabled: false };
	}

	const apiKey = await getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
	const model = await getSetting(SETTINGS_KEYS.AI_MODEL);

	if (!apiKey || !model) {
		return { enabled: false };
	}

	return { enabled: true, apiKey, model };
}
