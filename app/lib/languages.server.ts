import { existsSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

let cachedLanguages: string[] | null = null;

/**
 * Discover available languages by reading the public/locales directory (SYNC version)
 * Each language must have a common.json file to be considered valid
 * Use this for module initialization time when async is not possible (e.g., RemixI18Next setup)
 */
export function getAvailableLanguagesSync(): string[] {
	// Return cached result if available
	if (cachedLanguages !== null) {
		return cachedLanguages;
	}

	try {
		const localesPath = join(process.cwd(), "public", "locales");
		const entries = readdirSync(localesPath, { withFileTypes: true });

		const languages: string[] = [];
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const commonJsonPath = join(localesPath, entry.name, "common.json");
				if (existsSync(commonJsonPath)) {
					languages.push(entry.name);
				}
			}
		}

		// Sort for consistent ordering
		const sorted = languages.sort();

		// Cache the result
		cachedLanguages = sorted;

		return sorted;
	} catch (error) {
		console.error(
			"[getAvailableLanguagesSync] Error reading locales directory:",
			error,
		);
		// Fallback to default languages if directory read fails
		return ["en", "fi", "sv"];
	}
}

/**
 * Discover available languages by reading the public/locales directory (ASYNC version)
 * Each language must have a common.json file to be considered valid
 * Results are cached for performance
 */
export async function getAvailableLanguages(): Promise<string[]> {
	// Return cached result if available (useful for server-side rendering)
	if (cachedLanguages !== null) {
		return cachedLanguages;
	}

	try {
		const localesPath = join(process.cwd(), "public", "locales");
		const entries = await readdir(localesPath, { withFileTypes: true });

		const languages: string[] = [];
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const commonJsonPath = join(localesPath, entry.name, "common.json");
				if (existsSync(commonJsonPath)) {
					languages.push(entry.name);
				}
			}
		}

		// Sort for consistent ordering
		const sorted = languages.sort();

		// Cache the result
		cachedLanguages = sorted;

		return sorted;
	} catch (error) {
		console.error(
			"[getAvailableLanguages] Error reading locales directory:",
			error,
		);
		// Fallback to default languages if directory read fails
		return ["en", "fi", "sv"];
	}
}

/**
 * Clear the language cache (useful for development or when languages are added)
 */
export function clearLanguageCache(): void {
	cachedLanguages = null;
}
