/**
 * AI translation service for news and FAQ content
 * Uses OpenRouter to translate between primary and secondary app languages
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

export type TranslateDirection = "to_secondary" | "to_primary";

export interface NewsTranslationInput {
	title: string;
	summary: string | null;
	content: string;
}

export interface NewsTranslationResult {
	title: string;
	summary: string | null;
	content: string;
}

export interface FaqTranslationInput {
	question: string;
	answer: string;
}

export interface FaqTranslationResult {
	question: string;
	answer: string;
}

/**
 * Translate news fields (title, summary, content) from source to target language.
 * On parse/API errors, throws so callers can catch and notify.
 */
export async function translateNews(
	input: NewsTranslationInput,
	_sourceLang: string,
	targetLang: string,
	apiKey: string,
	modelId: string,
): Promise<NewsTranslationResult> {
	const openrouter = createOpenRouter({ apiKey });

	const prompt = `You are a professional translator. Translate the following news article from its current language into ${targetLang}.
Preserve tone and formatting. For empty summary use null in JSON.

Input:
Title: ${input.title}
Summary: ${input.summary ?? "(empty)"}
Content:
${input.content}

Return ONLY a valid JSON object with exactly these keys: "title", "summary", "content".
- "summary" must be a string or null if the original was empty.
- No markdown, no code fences, no explanation.`;

	const { text } = await generateText({
		model: openrouter(modelId),
		prompt,
	});

	const jsonStr = text
		.replace(/```json/g, "")
		.replace(/```/g, "")
		.trim();
	const parsed = JSON.parse(jsonStr) as {
		title?: string;
		summary?: string | null;
		content?: string;
	};

	if (
		typeof parsed.title !== "string" ||
		typeof parsed.content !== "string" ||
		(parsed.summary !== null && typeof parsed.summary !== "string")
	) {
		throw new Error(
			"Invalid AI response: missing or invalid title, summary, or content",
		);
	}

	return {
		title: parsed.title,
		summary: parsed.summary ?? null,
		content: parsed.content,
	};
}

/**
 * Translate FAQ question and answer from source to target language.
 */
export async function translateFaq(
	input: FaqTranslationInput,
	_sourceLang: string,
	targetLang: string,
	apiKey: string,
	modelId: string,
): Promise<FaqTranslationResult> {
	const openrouter = createOpenRouter({ apiKey });

	const prompt = `You are a professional translator. Translate the following FAQ entry from its current language into ${targetLang}.
Preserve tone and formatting.

Question: ${input.question}

Answer:
${input.answer}

Return ONLY a valid JSON object with exactly these keys: "question", "answer".
No markdown, no code fences, no explanation.`;

	const { text } = await generateText({
		model: openrouter(modelId),
		prompt,
	});

	const jsonStr = text
		.replace(/```json/g, "")
		.replace(/```/g, "")
		.trim();
	const parsed = JSON.parse(jsonStr) as { question?: string; answer?: string };

	if (
		typeof parsed.question !== "string" ||
		typeof parsed.answer !== "string"
	) {
		throw new Error(
			"Invalid AI response: missing or invalid question or answer",
		);
	}

	return {
		question: parsed.question,
		answer: parsed.answer,
	};
}
