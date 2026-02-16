/**
 * Server-side settings management
 * Handles system-wide configuration stored in app_settings table
 */
import { getDatabase } from "~/db/server.server";

export const SETTINGS_KEYS = {
	DEFAULT_PRIMARY_LANGUAGE: "default_primary_language",
	DEFAULT_SECONDARY_LANGUAGE: "default_secondary_language",
	DEFAULT_TIMEZONE: "default_timezone",
	THEME_PRIMARY_COLOR: "theme_primary_color",
} as const;

export interface SystemLanguageDefaults {
	primary: string;
	secondary: string;
}

export async function getSystemLanguageDefaults(): Promise<SystemLanguageDefaults> {
	const db = getDatabase();

	const [primary, secondary] = await Promise.all([
		db.getSetting(SETTINGS_KEYS.DEFAULT_PRIMARY_LANGUAGE),
		db.getSetting(SETTINGS_KEYS.DEFAULT_SECONDARY_LANGUAGE),
	]);

	return {
		primary: primary || "fi",
		secondary: secondary || "en",
	};
}

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

export async function getThemePrimaryColor(): Promise<string> {
	const db = getDatabase();
	const color = await db.getSetting(SETTINGS_KEYS.THEME_PRIMARY_COLOR);
	return color || "#ff2446";
}

export async function setThemePrimaryColor(color: string): Promise<void> {
	const db = getDatabase();
	await db.setSetting(
		SETTINGS_KEYS.THEME_PRIMARY_COLOR,
		color,
		"Primary color for theme (hex)",
	);
}

export async function getDefaultTimezone(): Promise<string> {
	const db = getDatabase();
	const timezone = await db.getSetting(SETTINGS_KEYS.DEFAULT_TIMEZONE);
	return timezone || "UTC";
}

export async function setDefaultTimezone(timezone: string): Promise<void> {
	const db = getDatabase();
	await db.setSetting(
		SETTINGS_KEYS.DEFAULT_TIMEZONE,
		timezone,
		"Default timezone for events (IANA timezone identifier)",
	);
}
