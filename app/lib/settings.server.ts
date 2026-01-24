/**
 * Server-side settings management
 * Handles system-wide configuration stored in app_settings table
 */
import { getDatabase } from "~/db";

export const SETTINGS_KEYS = {
	DEFAULT_PRIMARY_LANGUAGE: "default_primary_language",
	DEFAULT_SECONDARY_LANGUAGE: "default_secondary_language",
} as const;

export interface SystemLanguageDefaults {
	primary: string;
	secondary: string;
}

/**
 * Get system-wide language defaults
 * Falls back to 'fi'/'en' if not configured
 */
export async function getSystemLanguageDefaults(): Promise<SystemLanguageDefaults> {
	const db = getDatabase();

	// Fetch both settings in parallel
	const [primary, secondary] = await Promise.all([
		db.getSetting(SETTINGS_KEYS.DEFAULT_PRIMARY_LANGUAGE),
		db.getSetting(SETTINGS_KEYS.DEFAULT_SECONDARY_LANGUAGE),
	]);

	return {
		primary: primary || "fi",
		secondary: secondary || "en",
	};
}

/**
 * Update system-wide language defaults
 */
export async function updateSystemLanguageDefaults(
	primary: string,
	secondary: string,
): Promise<void> {
	const db = getDatabase();

	await Promise.all([
		db.setSetting(
			SETTINGS_KEYS.DEFAULT_PRIMARY_LANGUAGE,
			primary,
			"Default primary language for guests (fi/en)",
		),
		db.setSetting(
			SETTINGS_KEYS.DEFAULT_SECONDARY_LANGUAGE,
			secondary,
			"Default secondary language for guests (fi/en)",
		),
	]);
}
