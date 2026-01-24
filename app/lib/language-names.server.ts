import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAvailableLanguages } from "./languages.server";

let cachedLanguageNames: Record<string, string> | null = null;

/**
 * Get display names for all available languages
 * Returns a Record mapping language codes to their native display names
 * e.g., { en: "English", fi: "Suomi", sv: "Svenska", de: "Deutsch" }
 *
 * This is used to display language names in the language switcher
 * without needing to preload all language resources on the client.
 */
export async function getLanguageNames(): Promise<Record<string, string>> {
	// Return cached result if available
	if (cachedLanguageNames !== null) {
		return cachedLanguageNames;
	}

	try {
		const languages = await getAvailableLanguages();
		const localesPath = join(process.cwd(), "public", "locales");
		const names: Record<string, string> = {};

		for (const lang of languages) {
			try {
				const commonJsonPath = join(localesPath, lang, "common.json");
				const content = await readFile(commonJsonPath, "utf-8");
				const json = JSON.parse(content);

				// Extract lang.name from the JSON structure
				// Falls back to the language code if not found
				names[lang] = json?.lang?.name || lang;
			} catch (error) {
				console.warn(
					`[getLanguageNames] Could not read lang.name for ${lang}:`,
					error,
				);
				names[lang] = lang;
			}
		}

		// Cache the result
		cachedLanguageNames = names;

		return names;
	} catch (error) {
		console.error("[getLanguageNames] Error getting language names:", error);
		// Return empty object on error
		return {};
	}
}

/**
 * Clear the language names cache (useful for development or when languages are changed)
 */
export function clearLanguageNamesCache(): void {
	cachedLanguageNames = null;
}
