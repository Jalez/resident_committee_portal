/**
 * Shared email utilities (safe for both client and server).
 */

/**
 * Add Re: prefix to subject if not already present.
 */
export function addReplyPrefix(subject: string): string {
	const stripped = subject.replace(/^(Re|Fwd|Fw):\s*/gi, "").trim();
	return `Re: ${stripped}`;
}

/**
 * Add Fwd: prefix to subject if not already present.
 */
export function addForwardPrefix(subject: string): string {
	const stripped = subject.replace(/^(Re|Fwd|Fw):\s*/gi, "").trim();
	return `Fwd: ${stripped}`;
}
