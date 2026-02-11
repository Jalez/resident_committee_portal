export function getMinutesPrefix(): string {
	return "minutes/";
}

export function buildMinutePath(year: string, filename: string): string {
	// Sanitization is important
	const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
	return `${getMinutesPrefix()}${year}/${safeFilename}`;
}
