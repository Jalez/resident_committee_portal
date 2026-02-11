/**
 * Ollama client utilities for browser-side API calls
 * These functions call the user's local Ollama instance directly from the browser
 */

export interface OllamaModel {
	name: string;
	modified_at: string;
	size: number;
	digest: string;
	details?: {
		format: string;
		family: string;
		parameter_size: string;
		quantization_level: string;
	};
}

export interface OllamaModelsResponse {
	models: OllamaModel[];
}

/**
 * Fetch available models from Ollama
 */
export async function fetchOllamaModels(
	baseUrl: string,
): Promise<OllamaModel[]> {
	const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
	const response = await fetch(url, {
		method: "GET",
		headers: { Accept: "application/json" },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.status}`);
	}

	const data: OllamaModelsResponse = await response.json();
	return data.models || [];
}

export interface OllamaGenerateRequest {
	model: string;
	prompt: string;
	stream?: boolean;
	options?: {
		temperature?: number;
		num_predict?: number;
	};
}

export interface OllamaGenerateResponse {
	model: string;
	created_at: string;
	response: string;
	done: boolean;
	context?: number[];
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

/**
 * Generate a completion from Ollama (non-streaming)
 */
export async function generateOllamaCompletion(
	baseUrl: string,
	model: string,
	prompt: string,
): Promise<string> {
	const url = `${baseUrl.replace(/\/$/, "")}/api/generate`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			model,
			prompt,
			stream: false,
			options: {
				temperature: 0.3, // Lower temperature for more consistent translations
			},
		} satisfies OllamaGenerateRequest),
	});

	if (!response.ok) {
		throw new Error(`Ollama generation failed: ${response.status}`);
	}

	const data: OllamaGenerateResponse = await response.json();
	return data.response.trim();
}

/**
 * Translate a single text field using Ollama
 * Uses a simple prompt that asks for translation without JSON formatting
 */
export async function translateWithOllama(
	baseUrl: string,
	model: string,
	text: string,
	sourceLanguage: string,
	targetLanguage: string,
): Promise<string> {
	if (!text.trim()) {
		return "";
	}

	const prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. 
Only output the translated text, nothing else. Do not add quotes, explanations, or commentary.

Text to translate:
${text}

Translation:`;

	const result = await generateOllamaCompletion(baseUrl, model, prompt);

	// Clean up common artifacts from model outputs
	let cleaned = result.trim();

	// Remove surrounding quotes if present
	if (
		(cleaned.startsWith('"') && cleaned.endsWith('"')) ||
		(cleaned.startsWith("'") && cleaned.endsWith("'"))
	) {
		cleaned = cleaned.slice(1, -1);
	}

	return cleaned;
}

/**
 * Test connection to Ollama and return model count
 */
export async function testOllamaConnection(
	baseUrl: string,
): Promise<{ success: boolean; modelCount: number; error?: string }> {
	try {
		const models = await fetchOllamaModels(baseUrl);
		return { success: true, modelCount: models.length };
	} catch (error) {
		return {
			success: false,
			modelCount: 0,
			error: error instanceof Error ? error.message : "Connection failed",
		};
	}
}
