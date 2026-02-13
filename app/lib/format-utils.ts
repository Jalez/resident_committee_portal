export function formatCurrency(
	value: string | number | null | undefined,
): string {
	if (value === null || value === undefined) return "—";
	const num = typeof value === "string" ? parseFloat(value) : value;
	if (Number.isNaN(num)) return "—";
	return `${num.toFixed(2).replace(".", ",")} €`;
}

export function formatDate(
	date: Date | string | null | undefined,
	locale: string = "fi",
): string {
	if (!date) return "—";
	const localeStr = locale === "fi" ? "fi-FI" : "en-US";
	return new Date(date).toLocaleDateString(localeStr);
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
