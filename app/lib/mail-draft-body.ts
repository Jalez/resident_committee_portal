function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function plaintextToHtml(text: string): string {
	const escaped = escapeHtml(text);
	return escaped.replace(/\n/g, "<br>\n");
}

export function buildSignature(name?: string | null, regardsLine = "Best regards,") {
	const trimmedName = name?.trim();
	if (!trimmedName) return null;
	return `${regardsLine}\n${trimmedName}`;
}

function normalizeHtmlForContains(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.trim();
}

export function ensureSignedHtmlBody(
	htmlBody: string,
	name?: string | null,
	regardsLine = "Best regards,",
): string {
	const signature = buildSignature(name, regardsLine);
	if (!signature) return htmlBody;
	const normalized = normalizeHtmlForContains(htmlBody);
	if (normalized.includes(signature) || normalized.includes(regardsLine)) {
		return htmlBody;
	}

	const signatureHtml = `${escapeHtml(regardsLine)}<br>\n${escapeHtml(name?.trim() || "")}`;
	return htmlBody.trim()
		? `${htmlBody.trim()}<br>\n<br>\n${signatureHtml}`
		: signatureHtml;
}
