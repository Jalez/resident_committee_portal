export function getMinutesPrefix(): string {
	return "minutes/";
}

export function sanitizeMinuteDescription(description: string): string {
	return description
		.toLowerCase()
		.replace(/[^a-z0-9]/gi, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.substring(0, 50);
}

export function buildMinuteFilename(
	originalName: string,
	description: string,
	date = new Date(),
): string {
	const dateStamp = date.toISOString().split("T")[0];
	const ext = originalName.split(".").pop() || "pdf";
	const safeDescription = sanitizeMinuteDescription(description || "");
	if (safeDescription) {
		return `${dateStamp}_${safeDescription}.${ext}`;
	}
	return `${dateStamp}_minutes.${ext}`;
}

export function buildMinutePath(
	year: string,
	originalName: string,
	description?: string,
	date?: Date,
): string {
	const filename = buildMinuteFilename(
		originalName,
		description || "",
		date,
	);
	return `${getMinutesPrefix()}${year}/${filename}`;
}

export function isValidMinutePathname(pathname: string): boolean {
	const prefix = getMinutesPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}
