/**
 * Minute Analyzer
 * Content Source - Analyzes meeting minutes
 *
 * Analyzes meeting minutes to suggest:
 * 1. News articles (for noteworthy decisions/announcements)
 * 2. FAQ entries (for common questions answered in meeting)
 *
 * AI Enrichment:
 * - Extracts newsworthy content
 * - Identifies FAQ-worthy Q&A
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { DatabaseAdapter } from "~/db/adapters/types";
import type { Minute } from "~/db/schema";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type {
	AnalysisResult,
	EntityAnalyzer,
	EntitySuggestion,
} from "../entity-relationship-analyzer.server";

interface MinuteAnalysis {
	newsItems: Array<{
		title: string;
		content: string;
		confidence: number;
		reasoning: string;
	}>;
	faqItems: Array<{
		question: string;
		answer: string;
		confidence: number;
		reasoning: string;
	}>;
}

class MinuteAnalyzer implements EntityAnalyzer<Minute> {
	async analyze(minute: Minute, db: DatabaseAdapter): Promise<AnalysisResult> {
		const suggestions: EntitySuggestion[] = [];
		const errors: string[] = [];

		try {
			// We need the actual content of the minute to analyze
			// Minutes have fileUrl/fileKey, but for simplicity, let's use description
			// In a real implementation, you'd fetch and parse the file content
			const content = minute.description || minute.title || "";

			if (!content || content.length < 50) {
				return {
					suggestions: [],
					errors: ["Minute content too short or empty to analyze"],
				};
			}

			// Run AI analysis
			const aiAnalysis = await this.analyzeWithAI(minute, content, db);
			if (!aiAnalysis) {
				return {
					suggestions: [],
					errors: ["AI analysis failed or API key not configured"],
				};
			}

			// 1. Suggest News articles
			for (const newsItem of aiAnalysis.newsItems) {
				suggestions.push({
					entityType: "news",
					name: newsItem.title,
					data: {
						title: newsItem.title,
						content: newsItem.content,
						// News doesn't have draft status in the current schema
						// It's created directly
					},
					confidence: newsItem.confidence,
					reasoning: newsItem.reasoning,
				});
			}

			// 2. Suggest FAQ entries
			for (const faqItem of aiAnalysis.faqItems) {
				suggestions.push({
					entityType: "faq",
					name: faqItem.question,
					data: {
						question: faqItem.question,
						answer: faqItem.answer,
						// FAQ doesn't have draft status in the current schema
					},
					confidence: faqItem.confidence,
					reasoning: faqItem.reasoning,
				});
			}

			return {
				suggestions,
				enrichment: {
					tags: [
						...(aiAnalysis.newsItems.length > 0 ? ["has-news"] : []),
						...(aiAnalysis.faqItems.length > 0 ? ["has-faq"] : []),
					],
				},
				errors: errors.length > 0 ? errors : undefined,
			};
		} catch (error) {
			console.error("[MinuteAnalyzer] Analysis failed:", error);
			return {
				suggestions: [],
				errors: [error instanceof Error ? error.message : String(error)],
			};
		}
	}

	private async analyzeWithAI(
		minute: Minute,
		content: string,
		db: DatabaseAdapter,
	): Promise<MinuteAnalysis | null> {
		try {
			const apiKeySetting = await db.getAppSetting(
				SETTINGS_KEYS.OPENROUTER_API_KEY,
			);
			if (!apiKeySetting?.value) {
				console.warn("[MinuteAnalyzer] OpenRouter API key not configured");
				return null;
			}

			const openrouter = createOpenRouter({ apiKey: apiKeySetting.value });

			const prompt = `Analyze these meeting minutes for content worth sharing:

Meeting Title: ${minute.title || "Untitled"}
Date: ${minute.date ? new Date(minute.date).toLocaleDateString() : "No date"}
Content:
${content}

Determine:
1. Are there any decisions, announcements, or updates that should be published as NEWS? (e.g., policy changes, upcoming events, important decisions)
   - Extract a clear title and write a brief news article (2-3 sentences)
2. Are there any questions answered or clarifications made that would be useful as FAQ entries?
   - Extract the question and provide a clear answer

Return ONLY valid JSON (no markdown):
{
  "newsItems": [
    {
      "title": string,
      "content": string (2-3 sentences summarizing the news),
      "confidence": number (0-1),
      "reasoning": string
    }
  ],
  "faqItems": [
    {
      "question": string,
      "answer": string,
      "confidence": number (0-1),
      "reasoning": string
    }
  ]
}`;

			const { text } = await generateText({
				model: openrouter("anthropic/claude-3.5-sonnet"),
				prompt,
				temperature: 0.3,
			});

			if (!text) return null;

			// Clean markdown if present
			let jsonText = text.trim();
			if (jsonText.startsWith("```")) {
				const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
				if (match) {
					jsonText = match[1].trim();
				}
			}

			const analysis = JSON.parse(jsonText) as MinuteAnalysis;
			return analysis;
		} catch (error) {
			console.error("[MinuteAnalyzer] AI analysis failed:", error);
			return null;
		}
	}
}

export const minuteAnalyzer = new MinuteAnalyzer();
