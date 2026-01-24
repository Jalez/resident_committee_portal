import { resolve } from "node:path";
import Backend from "i18next-fs-backend";
import { RemixI18Next } from "remix-i18next/server";
import i18n from "./i18n"; // your i18n configuration file
import {
	getAvailableLanguages,
	getAvailableLanguagesSync,
} from "./lib/languages.server";

/**
 * Get supported languages dynamically from the filesystem
 * This is used server-side to discover available languages
 */
export async function getSupportedLanguages(): Promise<string[]> {
	const languages = await getAvailableLanguages();
	// Ensure fallback language exists
	if (!languages.includes(i18n.fallbackLng)) {
		console.warn(
			`[i18n] Fallback language "${i18n.fallbackLng}" not found in available languages. Adding it.`,
		);
		languages.push(i18n.fallbackLng);
		languages.sort();
	}
	return languages;
}

// Custom cookie implementation to handle raw strings written by client-side i18next
export const localeCookie = {
	name: "locale",
	isSigned: false,
	parse: async (cookieHeader: string | null) => {
		if (!cookieHeader) return null;
		// Match 'locale=value' manually to handle raw strings
		const match = cookieHeader.match(/(?:^|;)\s*locale=([^;]+)/);
		return match ? match[1] : null;
	},
	serialize: async (value: string) => {
		// Serialize simple key=value
		return `locale=${value}; Path=/; SameSite=Lax`;
	},
};

// Discover available languages at module initialization time
// This reads from the filesystem synchronously so RemixI18Next can be configured properly
const discoveredLanguages = getAvailableLanguagesSync();

const i18next = new RemixI18Next({
	detection: {
		// Use dynamically discovered languages - no hardcoded list needed
		// Adding a new language is as simple as creating public/locales/{lang}/common.json
		supportedLanguages: discoveredLanguages,
		fallbackLanguage: i18n.fallbackLng,
		order: ["cookie", "header"],
		cookie: localeCookie,
	},
	// This is the configuration for i18next meant for the Server-side only
	i18next: {
		...i18n,
		backend: {
			loadPath: resolve("./public/locales/{{lng}}/{{ns}}.json"),
		},
	},
	// The i18next plugins you want RemixI18next to use for `i18n.getFixedT` inside loaders and actions.
	plugins: [Backend],
});

// Override getLocale to validate against dynamically discovered languages
const originalGetLocale = i18next.getLocale.bind(i18next);
i18next.getLocale = async (request: Request) => {
	const detectedLocale = await originalGetLocale(request);
	const supportedLanguages = await getSupportedLanguages();

	// Validate that the detected locale is in our supported languages
	if (supportedLanguages.includes(detectedLocale)) {
		return detectedLocale;
	}

	// Fallback to the configured fallback language if detected language is not supported
	// Ensure fallback is also in supported languages
	if (supportedLanguages.includes(i18n.fallbackLng)) {
		return i18n.fallbackLng;
	}

	// Last resort: use first available language
	return supportedLanguages[0] || "en";
};

export default i18next;
