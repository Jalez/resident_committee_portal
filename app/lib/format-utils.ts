export function formatCurrency(
	value: string | number | null | undefined,
): string {
	if (value === null || value === undefined) return "—";
	const num = typeof value === "string" ? parseFloat(value) : value;
	if (Number.isNaN(num)) return "—";
	return `${num.toFixed(2).replace(".", ",")} €`;
}

/**
 * Map short locale codes to BCP 47 locale strings for Intl.DateTimeFormat
 */
const DATE_LOCALE_MAP: Record<string, string> = {
	fi: "fi-FI",
	sv: "sv-SE",
	en: "en-GB",
	"en-GB": "en-GB",
	"en-US": "en-US",
	"fi-FI": "fi-FI",
	"sv-SE": "sv-SE",
};

export function getDateLocaleString(locale: string): string {
	return DATE_LOCALE_MAP[locale] || locale;
}

export function formatDate(
	date: Date | string | null | undefined,
	locale: string = "fi",
	options?: Intl.DateTimeFormatOptions,
): string {
	if (!date) return "—";
	return new Date(date).toLocaleDateString(getDateLocaleString(locale), options);
}

export function formatBoolean(
	value: boolean | string | null | undefined,
	yesLabel: string = "Yes",
	noLabel: string = "No",
): string {
	if (value === null || value === undefined) return "—";
	const boolValue = value === true || value === "true" || value === "on";
	return boolValue ? yesLabel : noLabel;
}

