const AVATAR_PREFIX = "avatars";

export function getAvatarsPrefix(): string {
	return `${AVATAR_PREFIX}/`;
}

/** Returns true if the URL is a custom avatar (our blob store, avatars/ prefix). */
export function isCustomAvatarUrl(url: string | null | undefined): boolean {
	if (!url || typeof url !== "string") return false;
	return url.includes("blob.vercel-storage.com") && url.includes(AVATAR_PREFIX);
}

/**
 * Validates blob pathname for avatars. If userId is provided, path must be avatars/{userId}.ext
 */
export function isValidAvatarPathname(
	pathname: string,
	userId?: string,
): boolean {
	const prefix = getAvatarsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	const rest = pathname.slice(prefix.length);
	if (!rest) return false;
	// rest should be "{userId}.{ext}" - single segment
	const parts = rest.split("/").filter(Boolean);
	if (parts.length !== 1) return false;
	const [file] = parts;
	const dot = file.indexOf(".");
	if (dot <= 0) return false;
	const pathUserId = file.slice(0, dot);
	const ext = file.slice(dot + 1).toLowerCase();
	if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return false;
	if (userId !== undefined && pathUserId !== userId) return false;
	return true;
}
