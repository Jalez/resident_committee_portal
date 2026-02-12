import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import { analyzeTextFrequencies, SETTINGS_KEYS } from "~/lib/openrouter.server";

export async function action({ request }: ActionFunctionArgs) {
	// Require same permission as analytics page
	await requirePermission(request, "forms:read", getDatabase);

	const formData = await request.formData();
	const textsJson = formData.get("texts") as string;

	if (!textsJson) {
		return { error: "No text data provided" };
	}

	try {
		const texts = JSON.parse(textsJson);
		if (!Array.isArray(texts)) {
			return { error: "Invalid data format" };
		}

		// Filter empty strings
		const validTexts = texts.filter(
			(t) => typeof t === "string" && t.trim().length > 0,
		);

		if (validTexts.length === 0) {
			return { error: "No data to analyze" };
		}

		const db = getDatabase();
		const [apiKey, model] = await Promise.all([
			db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
			db.getSetting(SETTINGS_KEYS.ANALYTICS_AI_MODEL),
		]);

		if (!apiKey) {
			return { error: "AI API key not configured" };
		}
		if (!model) {
			return { error: "AI model not selected for analytics" };
		}

		const analysis = await analyzeTextFrequencies(validTexts, apiKey, model);
		return { data: analysis };
	} catch (error) {
		console.error("AI Analysis failed:", error);
		const message =
			error instanceof Error && error.message
				? `Analysis failed: ${error.message}`
				: "Analysis failed";
		return { error: message };
	}
}
