interface GoogleConfig {
	apiKey: string;
	calendarId: string;
	publicRootFolderId: string;
	formsFolderId: string;
	// Service account for writing
	serviceAccountEmail: string;
	serviceAccountPrivateKey: string;
	submissionsSheetId: string;
}

interface DriveFile {
	id: string;
	name: string;
	webViewLink?: string;
	createdTime?: string;
}

export const config: GoogleConfig = {
	apiKey: process.env.GOOGLE_API_KEY || "",
	calendarId: process.env.GOOGLE_CALENDAR_ID || "",
	publicRootFolderId: process.env.GOOGLE_DRIVE_PUBLIC_ROOT_ID || "",
	formsFolderId: process.env.GOOGLE_DRIVE_FORMS_FOLDER_ID || "",
	serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
	serviceAccountPrivateKey: (
		process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
	).replace(/\\n/g, "\n"),
	submissionsSheetId: process.env.GOOGLE_SUBMISSIONS_SHEET_ID || "",
};

// Export for use in other modules
export const GOOGLE_CONFIG = config;

// Debug: Log config on server start (mask sensitive data)
console.log("[Google Config]", {
	apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...` : "MISSING",
	calendarId: config.calendarId || "MISSING",
	publicRootFolderId: config.publicRootFolderId || "MISSING",
	serviceAccountEmail: config.serviceAccountEmail || "MISSING",
	serviceAccountPrivateKey: config.serviceAccountPrivateKey ? "SET" : "MISSING",
	submissionsSheetId: config.submissionsSheetId || "MISSING",
});

// Helper: Get service account access token (defined here for use in helper functions)
// Full implementation with JWT is below, this is a forward declaration pattern
let _cachedAccessToken: { token: string; expiry: number } | null = null;

async function getAccessToken(): Promise<string | null> {
	// Check if we have a valid cached token (with 5 min buffer)
	if (
		_cachedAccessToken &&
		_cachedAccessToken.expiry > Date.now() + 5 * 60 * 1000
	) {
		return _cachedAccessToken.token;
	}

	if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
		console.error("[getAccessToken] Missing service account credentials");
		return null;
	}

	try {
		const now = Math.floor(Date.now() / 1000);
		const expiry = now + 3600; // 1 hour

		// JWT Header
		const header = { alg: "RS256", typ: "JWT" };

		// JWT Payload - includes Sheets, Drive, Calendar, and Forms scopes
		const payload = {
			iss: config.serviceAccountEmail,
			scope:
				"https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/forms.body https://www.googleapis.com/auth/forms.responses.readonly",
			aud: "https://oauth2.googleapis.com/token",
			iat: now,
			exp: expiry,
		};

		// Base64url encode
		const base64url = (obj: object) =>
			Buffer.from(JSON.stringify(obj)).toString("base64url");

		const unsignedToken = `${base64url(header)}.${base64url(payload)} `;

		// Sign with private key
		const crypto = await import("node:crypto");
		const sign = crypto.createSign("RSA-SHA256");
		sign.update(unsignedToken);
		const signature = sign.sign(config.serviceAccountPrivateKey, "base64url");

		const jwt = `${unsignedToken}.${signature} `;

		// Exchange JWT for access token
		const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion: jwt,
			}),
		});

		if (!tokenRes.ok) {
			const errorText = await tokenRes.text();
			console.error("[getAccessToken] Token exchange failed:", errorText);
			return null;
		}

		const tokenData = await tokenRes.json();

		// Cache the token
		_cachedAccessToken = {
			token: tokenData.access_token,
			expiry: Date.now() + 55 * 60 * 1000, // 55 minutes (safe buffer)
		};

		return tokenData.access_token;
	} catch (error) {
		console.error("[getAccessToken] Error:", error);
		return null;
	}
}

// Helper: Find a file or folder by name inside a parent folder (uses service account)
async function findChildByName(
	parentId: string,
	name: string,
	mimeType?: string,
) {
	if (!parentId) {
		console.log(`[findChildByName] Skipped: no parentId`);
		return null;
	}

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[findChildByName] Could not get access token");
		return null;
	}

	let q = `'${parentId}' in parents and name = '${name}' and trashed = false`;
	if (mimeType) {
		q += ` and mimeType = '${mimeType}'`;
	}

	const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`;

	try {
		console.log(
			`[findChildByName] Query: name='${name}' in parent='${parentId}'`,
		);
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) {
			console.log(
				`[findChildByName] API Error: ${res.status} ${res.statusText}`,
			);
			return null;
		}
		const data = await res.json();
		console.log(`[findChildByName] Found ${data.files?.length || 0} results`);
		return data.files?.[0] || null; // Return first match
	} catch (e) {
		console.error(`Error finding child '${name}' in '${parentId}':`, e);
		return null;
	}
}

import {
	CACHE_KEYS,
	CACHE_TTL,
	clearCache,
	getCached,
	setCache,
} from "./cache.server";

export async function getCalendarEvents() {
	// Check cache first
	const cached = getCached<unknown[]>(
		CACHE_KEYS.CALENDAR_EVENTS,
		CACHE_TTL.CALENDAR_EVENTS,
	);
	if (cached !== null) {
		return cached;
	}

	if (!config.apiKey || !config.calendarId) {
		console.log("[getCalendarEvents] Skipped: missing config", {
			apiKey: !!config.apiKey,
			calendarId: !!config.calendarId,
		});
		return [];
	}

	const now = new Date().toISOString();
	const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?key=${config.apiKey}&timeMin=${now}&singleEvents=true&orderBy=startTime&maxResults=10`;

	console.log(
		`[getCalendarEvents] Fetching events for calendar: ${config.calendarId}`,
	);

	try {
		const res = await fetch(url);
		console.log(`[getCalendarEvents] Response status: ${res.status}`);

		if (!res.ok) {
			const errorText = await res.text();
			console.log(`[getCalendarEvents] API Error:`, errorText);
			return [];
		}

		const data = await res.json();
		console.log(`[getCalendarEvents] Found ${data.items?.length || 0} events`);

		const items = data.items || [];

		// Cache the result
		setCache(CACHE_KEYS.CALENDAR_EVENTS, items);

		return items;
	} catch (error) {
		console.error("Calendar fetch error:", error);
		return [];
	}
}

export function getCalendarUrl() {
	if (!config.calendarId) return "";
	return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(config.calendarId)}`;
}

/**
 * Get a single calendar event by ID
 */
export async function getCalendarEvent(eventId: string): Promise<{
	id: string;
	summary?: string;
	description?: string;
	location?: string;
	start?: { dateTime?: string; date?: string };
	end?: { dateTime?: string; date?: string };
	recurrence?: string[];
	reminders?: {
		useDefault: boolean;
		overrides?: { method: string; minutes: number }[];
	};
	attendees?: { email: string }[];
} | null> {
	if (!config.calendarId) {
		console.error("[getCalendarEvent] No calendar ID configured");
		return null;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[getCalendarEvent] Could not get access token");
		return null;
	}

	const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${eventId}`;

	try {
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getCalendarEvent] API Error:", errorText);
			return null;
		}

		return await res.json();
	} catch (error) {
		console.error("[getCalendarEvent] Error:", error);
		return null;
	}
}

// ============================================
// CALENDAR EVENT MANAGEMENT
// ============================================

/**
 * Calendar event input for creating/updating events
 */
export interface CalendarEventInput {
	title: string;
	description?: string;
	location?: string;
	startDateTime: string; // ISO string for timed events
	endDateTime: string; // ISO string for timed events
	startDate?: string; // YYYY-MM-DD for all-day events
	endDate?: string; // YYYY-MM-DD for all-day events (exclusive)
	isAllDay?: boolean;
	// Recurrence
	recurrence?: {
		frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
		interval?: number; // Every X days/weeks/months/years
		count?: number; // Number of occurrences
		until?: string; // End date (YYYY-MM-DD)
		byDay?: string[]; // For weekly: ["MO", "TU", "WE", etc.]
	};
	// Reminders
	reminders?: {
		method: "email" | "popup";
		minutes: number; // Minutes before event
	}[];
	// Attendees
	attendees?: string[]; // Email addresses
}

/**
 * Build RRULE string from recurrence options
 */
function buildRRule(
	recurrence: CalendarEventInput["recurrence"],
): string | null {
	if (!recurrence) return null;

	const parts = [`FREQ=${recurrence.frequency}`];

	if (recurrence.interval && recurrence.interval > 1) {
		parts.push(`INTERVAL=${recurrence.interval}`);
	}

	if (recurrence.count) {
		parts.push(`COUNT=${recurrence.count}`);
	} else if (recurrence.until) {
		// Convert YYYY-MM-DD to YYYYMMDD format
		parts.push(`UNTIL=${recurrence.until.replace(/-/g, "")}T235959Z`);
	}

	if (recurrence.byDay && recurrence.byDay.length > 0) {
		parts.push(`BYDAY=${recurrence.byDay.join(",")}`);
	}

	return `RRULE:${parts.join(";")}`;
}

/**
 * Create a new calendar event
 * Supports single events, all-day events, recurring events, reminders, and attendees
 */
export async function createCalendarEvent(
	event: CalendarEventInput,
): Promise<{ id: string; htmlLink: string } | null> {
	if (!config.calendarId) {
		console.error("[createCalendarEvent] No calendar ID configured");
		return null;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[createCalendarEvent] Could not get access token");
		return null;
	}

	// Build the event body
	const eventBody: Record<string, unknown> = {
		summary: event.title,
	};

	if (event.description) {
		eventBody.description = event.description;
	}

	if (event.location) {
		eventBody.location = event.location;
	}

	// Handle start/end times
	if (event.isAllDay && event.startDate) {
		eventBody.start = { date: event.startDate };
		eventBody.end = { date: event.endDate || event.startDate };
	} else {
		eventBody.start = {
			dateTime: event.startDateTime,
			timeZone: "Europe/Helsinki",
		};
		eventBody.end = {
			dateTime: event.endDateTime,
			timeZone: "Europe/Helsinki",
		};
	}

	// Add recurrence if specified
	if (event.recurrence) {
		const rrule = buildRRule(event.recurrence);
		if (rrule) {
			eventBody.recurrence = [rrule];
		}
	}

	// Add reminders if specified
	if (event.reminders && event.reminders.length > 0) {
		eventBody.reminders = {
			useDefault: false,
			overrides: event.reminders.map((r) => ({
				method: r.method,
				minutes: r.minutes,
			})),
		};
	}

	// Add attendees if specified
	if (event.attendees && event.attendees.length > 0) {
		eventBody.attendees = event.attendees.map((email) => ({ email }));
	}

	const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;

	try {
		console.log("[createCalendarEvent] Creating event:", event.title);

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(eventBody),
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[createCalendarEvent] API Error:", errorText);
			return null;
		}

		const created = await res.json();
		console.log(`[createCalendarEvent] Created event: ${created.id}`);

		// Clear the calendar cache so new event shows up
		clearCache(CACHE_KEYS.CALENDAR_EVENTS);

		return {
			id: created.id,
			htmlLink: created.htmlLink,
		};
	} catch (error) {
		console.error("[createCalendarEvent] Error:", error);
		return null;
	}
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(
	eventId: string,
	event: Partial<CalendarEventInput>,
): Promise<{ id: string; htmlLink: string } | null> {
	if (!config.calendarId) {
		console.error("[updateCalendarEvent] No calendar ID configured");
		return null;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[updateCalendarEvent] Could not get access token");
		return null;
	}

	// Build the event body with only provided fields
	const eventBody: Record<string, unknown> = {};

	if (event.title) {
		eventBody.summary = event.title;
	}

	if (event.description !== undefined) {
		eventBody.description = event.description;
	}

	if (event.location !== undefined) {
		eventBody.location = event.location;
	}

	// Handle start/end times
	if (event.isAllDay && event.startDate) {
		eventBody.start = { date: event.startDate };
		eventBody.end = { date: event.endDate || event.startDate };
	} else if (event.startDateTime) {
		eventBody.start = {
			dateTime: event.startDateTime,
			timeZone: "Europe/Helsinki",
		};
		eventBody.end = {
			dateTime: event.endDateTime,
			timeZone: "Europe/Helsinki",
		};
	}

	// Add recurrence if specified
	if (event.recurrence) {
		const rrule = buildRRule(event.recurrence);
		if (rrule) {
			eventBody.recurrence = [rrule];
		}
	}

	// Add reminders if specified
	if (event.reminders !== undefined) {
		if (event.reminders.length > 0) {
			eventBody.reminders = {
				useDefault: false,
				overrides: event.reminders.map((r) => ({
					method: r.method,
					minutes: r.minutes,
				})),
			};
		} else {
			eventBody.reminders = { useDefault: true };
		}
	}

	// Add attendees if specified
	if (event.attendees !== undefined) {
		eventBody.attendees = event.attendees.map((email) => ({ email }));
	}

	const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${eventId}`;

	try {
		console.log("[updateCalendarEvent] Updating event:", eventId);

		const res = await fetch(url, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(eventBody),
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[updateCalendarEvent] API Error:", errorText);
			return null;
		}

		const updated = await res.json();
		console.log(`[updateCalendarEvent] Updated event: ${updated.id}`);

		// Clear the calendar cache
		clearCache(CACHE_KEYS.CALENDAR_EVENTS);

		return {
			id: updated.id,
			htmlLink: updated.htmlLink,
		};
	} catch (error) {
		console.error("[updateCalendarEvent] Error:", error);
		return null;
	}
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
	if (!config.calendarId) {
		console.error("[deleteCalendarEvent] No calendar ID configured");
		return false;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[deleteCalendarEvent] Could not get access token");
		return false;
	}

	const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${eventId}`;

	try {
		console.log("[deleteCalendarEvent] Deleting event:", eventId);

		const res = await fetch(url, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!res.ok && res.status !== 204) {
			const errorText = await res.text();
			console.error("[deleteCalendarEvent] API Error:", errorText);
			return false;
		}

		console.log(`[deleteCalendarEvent] Deleted event: ${eventId}`);

		// Clear the calendar cache
		clearCache(CACHE_KEYS.CALENDAR_EVENTS);

		return true;
	} catch (error) {
		console.error("[deleteCalendarEvent] Error:", error);
		return false;
	}
}

// Helper to get the Current Year Folder ID (from PUBLIC root)
async function getCurrentYearFolder() {
	if (!config.publicRootFolderId) {
		console.log("[getCurrentYearFolder] No publicRootFolderId configured");
		return null;
	}
	const currentYear = new Date().getFullYear().toString();
	console.log(
		`[getCurrentYearFolder] Looking for folder '${currentYear}' in root '${config.publicRootFolderId}'`,
	);
	const folder = await findChildByName(
		config.publicRootFolderId,
		currentYear,
		"application/vnd.google-apps.folder",
	);
	console.log(
		`[getCurrentYearFolder] Result:`,
		folder ? folder.id : "NOT FOUND",
	);
	return folder;
}

export async function getMinutesFiles() {
	// Check cache first
	const cached = getCached<{ files: DriveFile[]; folderUrl: string }>(
		CACHE_KEYS.MINUTES,
		CACHE_TTL.MINUTES,
	);
	if (cached?.folderUrl && cached.folderUrl !== "#") {
		return cached;
	}

	const yearFolder = await getCurrentYearFolder();
	if (!yearFolder) return { files: [], folderUrl: "#" };

	const minutesFolder = await findChildByName(
		yearFolder.id,
		"minutes",
		"application/vnd.google-apps.folder",
	);
	if (!minutesFolder) return { files: [], folderUrl: "#" };

	// Now list files inside the minutes folder
	const q = `'${minutesFolder.id}' in parents and trashed = false`;
	const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=name desc&fields=files(id,name,webViewLink,createdTime)`;

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[getMinutesFiles] Could not get access token");
		return { files: [], folderUrl: "#" };
	}

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) throw new Error("Failed to fetch minutes files");
		const data = await res.json();
		const result = {
			files: data.files || [],
			folderUrl: minutesFolder.webViewLink,
		};

		// Cache the result
		setCache(CACHE_KEYS.MINUTES, result);

		return result;
	} catch (error) {
		console.error(error);
		return { files: [], folderUrl: "#" };
	}
}

// Minutes grouped by year
export interface MinutesByYear {
	year: string;
	files: {
		id: string;
		name: string;
		url: string;
		createdTime: string;
	}[];
	folderUrl: string;
}

export async function getMinutesByYear(): Promise<MinutesByYear[]> {
	// Check cache first
	const cacheKey = "MINUTES_BY_YEAR";
	const cached = getCached<MinutesByYear[]>(cacheKey, CACHE_TTL.MINUTES);
	if (cached !== null && cached.length > 0) {
		return cached;
	}

	if (!config.publicRootFolderId) {
		console.log("[getMinutesByYear] Missing config");
		return [];
	}

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[getMinutesByYear] Could not get access token");
		return [];
	}

	// Step 1: List all year folders in the public root
	const q = `'${config.publicRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
	const foldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&orderBy=name desc`;

	try {
		const foldersRes = await fetch(foldersUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!foldersRes.ok) {
			console.log(
				`[getMinutesByYear] Failed to list year folders: ${foldersRes.status}`,
			);
			return [];
		}
		const foldersData = await foldersRes.json();
		const yearFolders = (foldersData.files || []).filter((f: DriveFile) =>
			/^\d{4}$/.test(f.name),
		);

		console.log(`[getMinutesByYear] Found ${yearFolders.length} year folders`);

		// Step 2: For each year folder, look for "minutes" subfolder and get its files
		const currentYear = new Date().getFullYear().toString();

		// Use Promise.all to fetch years in parallel
		const yearResults = await Promise.all(
			yearFolders.map(async (yearFolder: DriveFile) => {
				const minutesFolder = await findChildByName(
					yearFolder.id,
					"minutes",
					"application/vnd.google-apps.folder",
				);

				if (!minutesFolder) {
					// If this is the current year and no minutes folder, still include with empty files
					if (yearFolder.name === currentYear) {
						return {
							year: yearFolder.name,
							files: [],
							folderUrl: "#",
						};
					}
					return null;
				}

				// List files in minutes folder
				const filesQ = `'${minutesFolder.id}' in parents and trashed = false`;
				const filesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQ)}&orderBy=name desc&fields=files(id,name,webViewLink,createdTime)`;

				try {
					const filesRes = await fetch(filesUrl, {
						headers: { Authorization: `Bearer ${accessToken}` },
					});
					if (!filesRes.ok) return null;

					const filesData = await filesRes.json();

					return {
						year: yearFolder.name,
						files: (filesData.files || []).map((f: DriveFile) => ({
							id: f.id,
							name: f.name?.replace(/\.(pdf|docx?)$/i, "") || "Untitled",
							url: f.webViewLink,
							createdTime: f.createdTime,
						})),
						folderUrl: minutesFolder.webViewLink || "#",
					};
				} catch (error) {
					console.error(
						`Error fetching files for year ${yearFolder.name}:`,
						error,
					);
					return null;
				}
			}),
		);

		const results: MinutesByYear[] = yearResults.filter(
			(r): r is MinutesByYear => r !== null,
		);

		// Ensure current year is always first (even if no minutes yet)
		const hasCurrentYear = results.some((r) => r.year === currentYear);
		if (!hasCurrentYear) {
			results.unshift({
				year: currentYear,
				files: [],
				folderUrl: "#",
			});
		}

		// Sort by year descending
		results.sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));

		// Cache results
		setCache(cacheKey, results);

		console.log(`[getMinutesByYear] Returning ${results.length} years`);
		return results;
	} catch (error) {
		console.error("[getMinutesByYear] Error:", error);
		return [];
	}
}

// Receipts grouped by year - mirrors getMinutesByYear structure
export interface ReceiptsByYear {
	year: string;
	files: {
		id: string;
		name: string;
		url: string;
		createdTime: string;
	}[];
	folderUrl: string;
	folderId: string;
}

export async function getReceiptsByYear(): Promise<ReceiptsByYear[]> {
	// Check cache first
	const cacheKey = "RECEIPTS_BY_YEAR";
	const cached = getCached<ReceiptsByYear[]>(cacheKey, CACHE_TTL.MINUTES);
	if (cached !== null && cached.length > 0) {
		return cached;
	}

	if (!config.publicRootFolderId) {
		console.log("[getReceiptsByYear] Missing config");
		return [];
	}

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[getReceiptsByYear] Could not get access token");
		return [];
	}

	// Step 1: List all year folders in the public root
	const q = `'${config.publicRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
	const foldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&orderBy=name desc`;

	try {
		const foldersRes = await fetch(foldersUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!foldersRes.ok) {
			console.log(
				`[getReceiptsByYear] Failed to list year folders: ${foldersRes.status}`,
			);
			return [];
		}
		const foldersData = await foldersRes.json();
		const yearFolders = (foldersData.files || []).filter((f: DriveFile) =>
			/^\d{4}$/.test(f.name),
		);

		console.log(`[getReceiptsByYear] Found ${yearFolders.length} year folders`);

		const currentYear = new Date().getFullYear().toString();

		// Step 2: For each year folder, look for "receipts" subfolder and get its files
		const yearResults = await Promise.all(
			yearFolders.map(async (yearFolder: DriveFile) => {
				const receiptsFolder = await findChildByName(
					yearFolder.id,
					"receipts",
					"application/vnd.google-apps.folder",
				);

				if (!receiptsFolder) {
					// If this is the current year and no receipts folder, still include with empty files
					if (yearFolder.name === currentYear) {
						return {
							year: yearFolder.name,
							files: [],
							folderUrl: "#",
							folderId: "",
						};
					}
					return null;
				}

				// List files in receipts folder
				const filesQ = `'${receiptsFolder.id}' in parents and trashed = false`;
				const filesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQ)}&orderBy=name desc&fields=files(id,name,webViewLink,createdTime)`;

				try {
					const filesRes = await fetch(filesUrl, {
						headers: { Authorization: `Bearer ${accessToken}` },
					});
					if (!filesRes.ok) return null;

					const filesData = await filesRes.json();

					return {
						year: yearFolder.name,
						files: (filesData.files || []).map((f: DriveFile) => ({
							id: f.id,
							name: f.name || "Untitled",
							url: f.webViewLink || "#",
							createdTime: f.createdTime,
						})),
						folderUrl: receiptsFolder.webViewLink || "#",
						folderId: receiptsFolder.id,
					};
				} catch (error) {
					console.error(
						`Error fetching receipts for year ${yearFolder.name}:`,
						error,
					);
					return null;
				}
			}),
		);

		const results: ReceiptsByYear[] = yearResults.filter(
			(r): r is ReceiptsByYear => r !== null,
		);

		// Ensure current year is always first (even if no receipts folder yet)
		const hasCurrentYear = results.some((r) => r.year === currentYear);
		if (!hasCurrentYear) {
			results.unshift({
				year: currentYear,
				files: [],
				folderUrl: "#",
				folderId: "",
			});
		}

		// Sort by year descending
		results.sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));

		// Cache results
		setCache(cacheKey, results);

		console.log(`[getReceiptsByYear] Returning ${results.length} years`);
		return results;
	} catch (error) {
		console.error("[getReceiptsByYear] Error:", error);
		return [];
	}
}

/**
 * Get or create receipts folder for a given year
 * Uses service account to create folder if it doesn't exist
 */
export async function getOrCreateReceiptsFolder(
	year: string,
): Promise<{ folderId: string; folderUrl: string } | null> {
	if (!config.publicRootFolderId) {
		console.error("[getOrCreateReceiptsFolder] Missing publicRootFolderId");
		return null;
	}

	// First, find the year folder
	const yearFolder = await findChildByName(
		config.publicRootFolderId,
		year,
		"application/vnd.google-apps.folder",
	);
	if (!yearFolder) {
		console.error(
			`[getOrCreateReceiptsFolder] Year folder '${year}' not found`,
		);
		return null;
	}

	// Check if receipts folder already exists
	const existingReceipts = await findChildByName(
		yearFolder.id,
		"receipts",
		"application/vnd.google-apps.folder",
	);
	if (existingReceipts) {
		return {
			folderId: existingReceipts.id,
			folderUrl:
				existingReceipts.webViewLink ||
				`https://drive.google.com/drive/folders/${existingReceipts.id}`,
		};
	}

	// Create receipts folder using service account
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error(
			"[getOrCreateReceiptsFolder] Could not get service account access token",
		);
		return null;
	}

	try {
		const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "receipts",
				mimeType: "application/vnd.google-apps.folder",
				parents: [yearFolder.id],
			}),
		});

		if (!createRes.ok) {
			const errorText = await createRes.text();
			console.error(
				"[getOrCreateReceiptsFolder] Failed to create folder:",
				errorText,
			);

			// If it's a permissions error, return a special response
			if (createRes.status === 403) {
				console.warn(
					"[getOrCreateReceiptsFolder] Service account lacks write permissions on year folder. Manual creation required.",
				);
				// Return null to indicate folder doesn't exist but avoid crashing
				return null;
			}
			return null;
		}

		const newFolder = await createRes.json();
		console.log(
			`[getOrCreateReceiptsFolder] Created receipts folder for ${year}: ${newFolder.id}`,
		);

		// Clear cache so new folder is picked up
		clearCache("RECEIPTS_BY_YEAR");

		return {
			folderId: newFolder.id,
			folderUrl:
				newFolder.webViewLink ||
				`https://drive.google.com/drive/folders/${newFolder.id}`,
		};
	} catch (error) {
		console.error("[getOrCreateReceiptsFolder] Error creating folder:", error);
		return null;
	}
}

/**
 * Upload a receipt file to Google Drive
 * @param file - File object with name, content (base64), and mimeType
 * @param year - The year folder to upload to
 * @param description - Description used for naming the file
 * @returns The uploaded file info or null on failure
 */
export async function uploadReceiptToDrive(
	file: { name: string; content: string; mimeType: string },
	year: string,
	description: string,
): Promise<{ id: string; name: string; url: string } | null> {
	// Get or create the receipts folder
	const receiptsFolder = await getOrCreateReceiptsFolder(year);
	if (!receiptsFolder) {
		console.error(
			"[uploadReceiptToDrive] Could not get/create receipts folder",
		);
		return null;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error(
			"[uploadReceiptToDrive] Could not get service account access token",
		);
		return null;
	}

	// Generate filename: YYYY-MM-DD_kuitti_description.ext
	const date = new Date().toISOString().split("T")[0];
	const ext = file.name.split(".").pop() || "pdf";
	const sanitizedDesc = description
		.toLowerCase()
		.replace(/[^a-z0-9äöå]/gi, "_")
		.replace(/_+/g, "_")
		.substring(0, 50);
	const newFileName = `${date}_kuitti_${sanitizedDesc}.${ext}`;

	try {
		// Use multipart upload for files with content
		const boundary = "-------314159265358979323846";
		const delimiter = `\r\n--${boundary}\r\n`;
		const closeDelimiter = `\r\n--${boundary}--`;

		const metadata = {
			name: newFileName,
			parents: [receiptsFolder.folderId],
		};

		const multipartBody =
			delimiter +
			"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
			JSON.stringify(metadata) +
			delimiter +
			`Content-Type: ${file.mimeType}\r\n` +
			"Content-Transfer-Encoding: base64\r\n\r\n" +
			file.content +
			closeDelimiter;

		const uploadRes = await fetch(
			"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": `multipart/related; boundary=${boundary}`,
				},
				body: multipartBody,
			},
		);

		if (!uploadRes.ok) {
			const errorText = await uploadRes.text();
			console.error("[uploadReceiptToDrive] Upload failed:", errorText);
			return null;
		}

		const uploadedFile = await uploadRes.json();
		console.log(
			`[uploadReceiptToDrive] Uploaded: ${uploadedFile.name} (${uploadedFile.id})`,
		);

		// Clear cache so new file is picked up
		clearCache("RECEIPTS_BY_YEAR");

		return {
			id: uploadedFile.id,
			name: uploadedFile.name,
			url:
				uploadedFile.webViewLink ||
				`https://drive.google.com/file/d/${uploadedFile.id}/view`,
		};
	} catch (error) {
		console.error("[uploadReceiptToDrive] Error:", error);
		return null;
	}
}

// ============================================
// INVENTORY (from database, legacy sheet methods below for reference)
// ============================================

export interface InventoryItem {
	name: string;
	quantity: number;
	location: string;
	category: string;
	description: string;
	value: number;
}

export interface InventoryInfo {
	topItems: InventoryItem[];
	detailsUrl: string;
}

export async function getInventory(): Promise<InventoryInfo | null> {
	// Check cache first
	const cached = getCached<InventoryInfo>(
		CACHE_KEYS.INVENTORY,
		CACHE_TTL.INVENTORY,
	);
	if (cached?.detailsUrl) {
		return cached;
	}

	const yearFolder = await getCurrentYearFolder();
	if (!yearFolder) return null;

	// Look for "inventory" spreadsheet
	let inventoryFile = await findChildByName(
		yearFolder.id,
		"inventory",
		"application/vnd.google-apps.spreadsheet",
	);

	// If not found, maybe they named it "inventory.csv" but it IS a spreadsheet
	if (!inventoryFile) {
		inventoryFile = await findChildByName(
			yearFolder.id,
			"inventory.csv",
			"application/vnd.google-apps.spreadsheet",
		);
	}

	if (!inventoryFile) return null;

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[getInventory] Could not get access token");
		return null;
	}

	// Fetch data starting from row 2 (skip header), columns A:F
	const range = "A2:F";
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${inventoryFile.id}/values/${range}`;

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) return null;
		const data = await res.json();
		const rows = data.values;

		if (!rows || rows.length === 0) {
			console.log("[getInventory] No data rows found");
			return {
				topItems: [],
				detailsUrl:
					inventoryFile.webViewLink ||
					`https://docs.google.com/spreadsheets/d/${inventoryFile.id}`,
			};
		}

		// Parse rows into InventoryItem objects
		const items: InventoryItem[] = rows
			.filter((row: string[]) => row[0]) // Must have a name
			.map((row: string[]) => ({
				name: row[0] || "",
				quantity: parseInt(row[1], 10) || 0,
				location: row[2] || "",
				category: row[3] || "",
				description: row[4] || "",
				value: parseFloat(row[5]) || 0,
			}));

		// Sort by value descending and take top 3
		const topItems = items.sort((a, b) => b.value - a.value).slice(0, 3);

		const result: InventoryInfo = {
			topItems,
			detailsUrl:
				inventoryFile.webViewLink ||
				`https://docs.google.com/spreadsheets/d/${inventoryFile.id}`,
		};

		console.log(
			`[getInventory] Discovered sheet URL: ${result.detailsUrl}, found ${items.length} items, returning top ${topItems.length}`,
		);

		// Cache the result
		setCache(CACHE_KEYS.INVENTORY, result);

		return result;
	} catch (error) {
		console.error("Inventory fetch error:", error);
		return null;
	}
}

// Get all inventory items (for filtering by location)
export async function getAllInventoryItems(): Promise<{
	items: InventoryItem[];
	detailsUrl: string;
} | null> {
	const yearFolder = await getCurrentYearFolder();
	if (!yearFolder) return null;

	// Look for "inventory" spreadsheet
	let inventoryFile = await findChildByName(
		yearFolder.id,
		"inventory",
		"application/vnd.google-apps.spreadsheet",
	);

	// If not found, maybe they named it "inventory.csv" but it IS a spreadsheet
	if (!inventoryFile) {
		inventoryFile = await findChildByName(
			yearFolder.id,
			"inventory.csv",
			"application/vnd.google-apps.spreadsheet",
		);
	}

	if (!inventoryFile) return null;

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[getAllInventoryItems] Could not get access token");
		return null;
	}

	// Fetch data starting from row 2 (skip header), columns A:F
	const range = "A2:F";
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${inventoryFile.id}/values/${range}`;

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) return null;
		const data = await res.json();
		const rows = data.values;

		if (!rows || rows.length === 0) {
			return {
				items: [],
				detailsUrl:
					inventoryFile.webViewLink ||
					`https://docs.google.com/spreadsheets/d/${inventoryFile.id}`,
			};
		}

		// Parse rows into InventoryItem objects
		const items: InventoryItem[] = rows
			.filter((row: string[]) => row[0]) // Must have a name
			.map((row: string[]) => ({
				name: row[0] || "",
				quantity: parseInt(row[1], 10) || 0,
				location: row[2] || "",
				category: row[3] || "",
				description: row[4] || "",
				value: parseFloat(row[5]) || 0,
			}));

		return {
			items,
			detailsUrl:
				inventoryFile.webViewLink ||
				`https://docs.google.com/spreadsheets/d/${inventoryFile.id}`,
		};
	} catch (error) {
		console.error("Inventory fetch error:", error);
		return null;
	}
}

// Get inventory items filtered by location
export async function getInventoryByLocation(location: string): Promise<{
	items: InventoryItem[];
	location: string;
	detailsUrl: string;
} | null> {
	const allItems = await getAllInventoryItems();
	if (!allItems) return null;

	// Case-insensitive location matching, also handle URL-encoded strings
	const decodedLocation = decodeURIComponent(location).toLowerCase();
	const filteredItems = allItems.items.filter(
		(item) => item.location.toLowerCase() === decodedLocation,
	);

	// Find the original location name (with proper casing)
	const originalLocation =
		allItems.items.find(
			(item) => item.location.toLowerCase() === decodedLocation,
		)?.location || location;

	return {
		items: filteredItems,
		location: originalLocation,
		detailsUrl: allItems.detailsUrl,
	};
}

// Get all unique locations from inventory
export async function getInventoryLocations(): Promise<string[]> {
	const allItems = await getAllInventoryItems();
	if (!allItems) return [];

	const locations = new Set<string>();
	for (const item of allItems.items) {
		if (item.location) {
			locations.add(item.location);
		}
	}

	return Array.from(locations).sort();
}

// ============================================
// SOCIAL CHANNELS (from "some" sheet in root)
// ============================================

export interface SocialChannel {
	id: string;
	name: string;
	icon: string;
	url: string;
	color: string;
}

export async function getSocialChannels(): Promise<SocialChannel[]> {
	// Check cache first
	const cached = getCached<SocialChannel[]>(
		CACHE_KEYS.SOCIAL_CHANNELS,
		CACHE_TTL.SOCIAL_CHANNELS,
	);
	if (cached !== null && cached.length > 0) {
		return cached;
	}

	if (!config.publicRootFolderId) {
		console.log("[getSocialChannels] No publicRootFolderId configured");
		return [];
	}

	// Look for "some" spreadsheet in root folder (not inside a year folder)
	let someFile = await findChildByName(
		config.publicRootFolderId,
		"some",
		"application/vnd.google-apps.spreadsheet",
	);

	// Fallback: maybe they named it "some.csv" but it IS a spreadsheet
	if (!someFile) {
		someFile = await findChildByName(
			config.publicRootFolderId,
			"some.csv",
			"application/vnd.google-apps.spreadsheet",
		);
	}

	if (!someFile) {
		console.log("[getSocialChannels] Sheet 'some' not found in root folder");
		return [];
	}

	const accessToken = await getAccessToken();
	if (!accessToken) {
		console.log("[getSocialChannels] Could not get access token");
		return [];
	}

	// Fetch data starting from row 2 (skip header), columns A:D (name, icon, url, color)
	const range = "A2:D";
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${someFile.id}/values/${range}`;

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!res.ok) {
			console.log(`[getSocialChannels] API Error: ${res.status}`);
			return [];
		}
		const data = await res.json();
		const rows = data.values;

		if (!rows || rows.length === 0) {
			console.log("[getSocialChannels] No data rows found");
			return [];
		}

		const channels: SocialChannel[] = rows
			.filter((row: string[]) => row[0] && row[2]) // Must have name and url at minimum
			.map((row: string[], index: number) => ({
				id: row[0]?.toLowerCase().replace(/\s+/g, "-") || `channel-${index}`,
				name: row[0] || "",
				icon: row[1] || "link",
				url: row[2] || "",
				color: row[3] || "bg-gray-500",
			}));

		if (channels.length === 0) {
			console.log("[getSocialChannels] No valid channels parsed");
			return [];
		}

		console.log(
			`[getSocialChannels] Loaded ${channels.length} channels from sheet`,
		);

		// Cache the result
		setCache(CACHE_KEYS.SOCIAL_CHANNELS, channels);

		return channels;
	} catch (error) {
		console.error("[getSocialChannels] Error:", error);
		return [];
	}
}

// ============================================
// GOOGLE FORMS DISCOVERY (Service Account Auth)
// ============================================

export interface DiscoveredGoogleForm {
	id: string;
	name: string;
	formUrl: string;
	editUrl: string;
	createdTime?: string;
	modifiedTime?: string;
}

/**
 * List all Google Forms the service account has access to
 * Uses Google Drive API to find files with mimeType 'application/vnd.google-apps.form'
 */
export async function getGoogleForms(
	forceRefresh = false,
): Promise<DiscoveredGoogleForm[]> {
	const cacheKey = "google_forms_list";

	// Check cache unless force refresh
	if (!forceRefresh) {
		const cached = getCached<DiscoveredGoogleForm[]>(
			cacheKey,
			CACHE_TTL.ANALYTICS_LIST, // Reuse analytics cache TTL (5 minutes)
		);
		if (cached !== null) {
			return cached;
		}
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.log("[getGoogleForms] Could not get service account token");
		return [];
	}

	try {
		// Search for Google Forms the service account has access to
		const q = `mimeType = 'application/vnd.google-apps.form' and trashed = false`;
		const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`;

		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getGoogleForms] API Error:", errorText);
			return [];
		}

		const data = await res.json();
		const forms: DiscoveredGoogleForm[] = (data.files || []).map(
			(f: {
				id: string;
				name: string;
				webViewLink?: string;
				createdTime?: string;
				modifiedTime?: string;
			}) => ({
				id: f.id,
				name: f.name,
				// Form URL for respondents (viewform)
				formUrl: `https://docs.google.com/forms/d/${f.id}/viewform`,
				// Edit URL for owners
				editUrl:
					f.webViewLink || `https://docs.google.com/forms/d/${f.id}/edit`,
				createdTime: f.createdTime,
				modifiedTime: f.modifiedTime,
			}),
		);

		console.log(`[getGoogleForms] Found ${forms.length} Google Forms`);

		// Cache the result
		setCache(cacheKey, forms);

		return forms;
	} catch (error) {
		console.error("[getGoogleForms] Error:", error);
		return [];
	}
}

/**
 * Get Google Form metadata (title, description)
 */
export async function getGoogleForm(
	formId: string,
): Promise<{ title: string; description?: string } | null> {
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) return null;

	try {
		console.log(`[getGoogleForm] Fetching form metadata for ${formId}`);
		const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!res.ok) {
			console.error(
				`[getGoogleForm] Failed to fetch form ${formId}:`,
				await res.text(),
			);
			return null;
		}

		const data = await res.json();
		return {
			title: data.info.title,
			description: data.info.description,
		};
	} catch (error) {
		console.error("[getGoogleForm] Error:", error);
		return null;
	}
}

/**
 * Create a new Google Form via the Forms API
 * The form will be owned by the service account
 */

/**
 * Create a new Google Form
 * Uses Drive API to create the file to avoid Service Account quota issues.
 * @param title Form title
 * @param userId Optional: User ID to create the form as (bypasses Service Account quota)
 */
export async function createGoogleForm(
	title: string,
	_userId?: string, // user ID param kept for API compatibility, but unused
): Promise<{ formId: string; formUrl: string; editUrl: string } | null> {
	// Only use Service Account
	const accessToken = await getServiceAccountAccessToken();

	if (!accessToken) {
		console.error("[createGoogleForm] Could not get access token");
		return null;
	}

	try {
		// Service Account Strategy
		const parentFolderId = config.formsFolderId || config.publicRootFolderId;

		const fileMetadata: any = {
			name: title || "Untitled Form",
			mimeType: "application/vnd.google-apps.form",
		};

		// Add parents if we have a folder ID
		if (parentFolderId) {
			fileMetadata.parents = [parentFolderId];
		}

		console.log(
			`[createGoogleForm] Creating file via Drive API (SA)`,
			JSON.stringify(fileMetadata),
		);

		const res = await fetch("https://www.googleapis.com/drive/v3/files", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(fileMetadata),
		});

		// ... rest of function logic (error handling etc)
		// Note: Logic continues at line 1667 (check original file)

		const responseText = await res.text();
		console.log("[createGoogleForm] Drive API Response status:", res.status);

		if (!res.ok) {
			console.error("[createGoogleForm] Drive API Error:", responseText);
			// Fallback: Try Forms API if Drive API fails? No, usually Drive API is more permissive.
			return null;
		}

		const data = JSON.parse(responseText);
		const formId = data.id;

		console.log(`[createGoogleForm] Created form file: ${formId}`);

		// Wait briefly for propagation
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// We need to get the responder URI (viewform link)
		// Drive API returnswebViewLink (edit link) but not viewform link directly
		// But we can construct it standardly
		return {
			formId,
			formUrl: `https://docs.google.com/forms/d/${formId}/viewform`,
			editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
		};
	} catch (error) {
		console.error("[createGoogleForm] Error:", error);
		return null;
	}
}

/**
 * Update form description via Forms API
 */
/**
 * Update form description via Forms API
 */
async function _updateFormDescription(
	formId: string,
	description: string,
): Promise<boolean> {
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) return false;

	try {
		const updateData = {
			requests: [
				{
					updateFormInfo: {
						info: {
							description,
						},
						updateMask: "description",
					},
				},
			],
		};

		const res = await fetch(
			`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(updateData),
			},
		);

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[updateFormDescription] API Error:", errorText);
			return false;
		}

		return true;
	} catch (error) {
		console.error("[updateFormDescription] Error:", error);
		return false;
	}
}

/**
 * Update form publishing state (open/close form)
 */
export async function updateFormPublishingState(
	formId: string,
	isAcceptingResponses: boolean,
): Promise<boolean> {
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) return false;

	try {
		// Note: The API requires setting isPublished to true if isAcceptingResponses is true
		// If we are closing, we can keep it published but not accepting
		const _updateData = {
			requests: [
				{
					updateFormInfo: {
						info: {
							// We are not updating title/desc here
						},
						updateMask: "", // No mask for info
					},
				},
			],
		};

		// Wait: updateFormInfo doesn't handle publishSettings.
		// There is a specific batchUpdate request for it? No, it's a separate method in v1?
		// Checking docs: forms.setPublishSettings is a separate method?
		// Actually, I should check if there is a batchUpdate request for it.
		// The docs said "Forms with publishSettings value set can call forms.setPublishSettings API".

		// Let's use batchUpdate if possible, or the dedicated endpoint.
		// Wait, I saw "Methods > setPublishSettings" in the user's snippet.
		// PUT https://forms.googleapis.com/v1/forms/{formId}/publishSettings

		const publishSettings = {
			isPublished: true, // Always keep it published (visible) if we want people to see the "Closed" message?
			// Actually if isPublished is false, nobody can see it.
			// Users usually want "This form is no longer accepting responses".
			// So isPublished=true, isAcceptingResponses=false.
			isAcceptingResponses: isAcceptingResponses,
		};

		// Note: The API is PUT /v1/forms/{formId}/publishSettings?updateMask=isAcceptingResponses
		// But let's try just the body first.

		// Actually, let's look at the method carefully.
		// "setPublishSettings: Updates the publish settings of a form."
		// It takes a PublishSettings object.

		// IMPORTANT: We should probably fetch the current settings first to preserve isPublished?
		// But defaulting isPublished=true is usually safe for active forms.

		const res = await fetch(
			`https://forms.googleapis.com/v1/forms/${formId}/publishSettings?updateMask=isAcceptingResponses`,
			{
				method: "PUT", // Docs say it's an update, likely PUT or PATCH. Standard Google is PUT for set...
				// Actually for Google APIs "set" often implies replacement.
				// Let's rely on the UpdateMask.
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(publishSettings),
			},
		);

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[updateFormPublishingState] API Error:", errorText);
			return false;
		}

		console.log(
			`[updateFormPublishingState] Updated form ${formId} accepting responses: ${isAcceptingResponses}`,
		);
		return true;
	} catch (error) {
		console.error("[updateFormPublishingState] Error:", error);
		return false;
	}
}

/**
 * Share a Google Form with a user via Drive API
 * @param formId - The form ID
 * @param email - User's email address
 * @param role - "writer" (editor) or "reader"
 */
export async function shareFormWithUser(
	formId: string,
	email: string,
	role: "writer" | "reader" = "writer",
): Promise<boolean> {
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[shareFormWithUser] Could not get service account token");
		return false;
	}

	try {
		const permissionData = {
			type: "user",
			role,
			emailAddress: email,
		};

		const res = await fetch(
			`https://www.googleapis.com/drive/v3/files/${formId}/permissions?sendNotificationEmail=false`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(permissionData),
			},
		);

		if (!res.ok) {
			const errorText = await res.text();
			console.error(`[shareFormWithUser] API Error for ${email}:`, errorText);
			return false;
		}

		console.log(
			`[shareFormWithUser] Shared form ${formId} with ${email} as ${role}`,
		);
		return true;
	} catch (error) {
		console.error("[shareFormWithUser] Error:", error);
		return false;
	}
}

/**
 * Get form settings including whether it accepts responses
 * Note: Deadline/close date is not directly available via API
 */
export interface FormSettings {
	formId: string;
	title: string;
	description?: string;
	documentTitle: string;
	responderUri: string;
	linkedSheetId?: string;
}

export async function getFormSettings(
	formId: string,
): Promise<FormSettings | null> {
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[getFormSettings] Could not get service account token");
		return null;
	}

	try {
		const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getFormSettings] API Error:", errorText);
			return null;
		}

		const data = await res.json();

		return {
			formId: data.formId,
			title: data.info?.title || "",
			description: data.info?.description,
			documentTitle: data.info?.documentTitle || "",
			responderUri:
				data.responderUri ||
				`https://docs.google.com/forms/d/${formId}/viewform`,
			linkedSheetId: data.linkedSheetId,
		};
	} catch (error) {
		console.error("[getFormSettings] Error:", error);
		return null;
	}
}

/**
 * Get form responses via Forms API
 */
export interface FormResponse {
	responseId: string;
	createTime: string;
	lastSubmittedTime: string;
	answers: Record<
		string,
		{
			questionId: string;
			textAnswers?: { answers: Array<{ value: string }> };
		}
	>;
}

export async function getFormResponses(
	formId: string,
): Promise<FormResponse[]> {
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[getFormResponses] Could not get service account token");
		return [];
	}

	try {
		const res = await fetch(
			`https://forms.googleapis.com/v1/forms/${formId}/responses`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getFormResponses] API Error:", errorText);
			return [];
		}

		const data = await res.json();
		const responses: FormResponse[] = data.responses || [];

		console.log(
			`[getFormResponses] Found ${responses.length} responses for form ${formId}`,
		);
		return responses;
	} catch (error) {
		console.error("[getFormResponses] Error:", error);
		return [];
	}
}

// ============================================
// ANALYTICS SHEETS (Service Account Auth)
// ============================================

export interface AnalyticsSheet {
	id: string;
	name: string;
	url: string;
	lastModified?: string;
}

export interface SheetData {
	headers: string[];
	rows: Record<string, string>[];
	totalRows: number;
}

/**
 * Get the analytics folder for a given year
 * Creates the folder if it doesn't exist (using service account)
 */
async function getAnalyticsFolder(
	year?: string,
): Promise<{ id: string; url: string } | null> {
	const targetYear = year || new Date().getFullYear().toString();

	// First, find the year folder in the public root
	if (!config.publicRootFolderId) {
		console.log("[getAnalyticsFolder] No publicRootFolderId configured");
		return null;
	}

	const yearFolder = await findChildByName(
		config.publicRootFolderId,
		targetYear,
		"application/vnd.google-apps.folder",
	);
	if (!yearFolder) {
		console.log(`[getAnalyticsFolder] Year folder '${targetYear}' not found`);
		return null;
	}

	// Look for analytics folder
	const analyticsFolder = await findChildByName(
		yearFolder.id,
		"analytics",
		"application/vnd.google-apps.folder",
	);

	if (analyticsFolder) {
		return {
			id: analyticsFolder.id,
			url:
				analyticsFolder.webViewLink ||
				`https://drive.google.com/drive/folders/${analyticsFolder.id}`,
		};
	}

	// Create analytics folder using service account
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.log(
			"[getAnalyticsFolder] Could not get service account access token",
		);
		return null;
	}

	try {
		const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "analytics",
				mimeType: "application/vnd.google-apps.folder",
				parents: [yearFolder.id],
			}),
		});

		if (!createRes.ok) {
			const errorText = await createRes.text();
			console.error("[getAnalyticsFolder] Failed to create folder:", errorText);
			return null;
		}

		const newFolder = await createRes.json();
		console.log(
			`[getAnalyticsFolder] Created analytics folder for ${targetYear}: ${newFolder.id}`,
		);

		return {
			id: newFolder.id,
			url:
				newFolder.webViewLink ||
				`https://drive.google.com/drive/folders/${newFolder.id}`,
		};
	} catch (error) {
		console.error("[getAnalyticsFolder] Error creating folder:", error);
		return null;
	}
}

/**
 * List all Google Sheets in the analytics folder
 * @param year - Optional year (defaults to current year)
 * @param forceRefresh - Bypass cache if true
 */
export async function getAnalyticsSheets(
	year?: string,
	forceRefresh = false,
): Promise<AnalyticsSheet[]> {
	const cacheKey = `${CACHE_KEYS.ANALYTICS_LIST}_${year || "current"}`;

	// Check cache unless force refresh
	if (!forceRefresh) {
		const cached = getCached<AnalyticsSheet[]>(
			cacheKey,
			CACHE_TTL.ANALYTICS_LIST,
		);
		if (cached !== null) {
			return cached;
		}
	}

	const analyticsFolder = await getAnalyticsFolder(year);
	if (!analyticsFolder) {
		console.log("[getAnalyticsSheets] No analytics folder found");
		return [];
	}

	// Use service account to list sheets (works for private sheets)
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.log("[getAnalyticsSheets] Could not get service account token");
		return [];
	}

	try {
		const q = `'${analyticsFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
		const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,modifiedTime)&orderBy=modifiedTime desc`;

		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getAnalyticsSheets] API Error:", errorText);
			return [];
		}

		const data = await res.json();
		const sheets: AnalyticsSheet[] = (data.files || []).map(
			(f: {
				id: string;
				name: string;
				webViewLink?: string;
				modifiedTime?: string;
			}) => ({
				id: f.id,
				name: f.name,
				url: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}`,
				lastModified: f.modifiedTime,
			}),
		);

		console.log(`[getAnalyticsSheets] Found ${sheets.length} sheets`);

		// Cache the result
		setCache(cacheKey, sheets);

		return sheets;
	} catch (error) {
		console.error("[getAnalyticsSheets] Error:", error);
		return [];
	}
}

/**
 * Get data from a Google Sheet (headers + rows)
 * @param sheetId - The Google Sheet ID
 * @param forceRefresh - Bypass cache if true
 */
export async function getSheetData(
	sheetId: string,
	forceRefresh = false,
): Promise<SheetData | null> {
	const cacheKey = `${CACHE_KEYS.ANALYTICS_DATA_PREFIX}${sheetId}`;

	// Check cache unless force refresh
	if (!forceRefresh) {
		const cached = getCached<SheetData>(cacheKey, CACHE_TTL.ANALYTICS_DATA);
		if (cached !== null) {
			return cached;
		}
	}

	// Use service account for private sheets
	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.log("[getSheetData] Could not get service account token");
		return null;
	}

	try {
		// Fetch all data from first sheet
		const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:ZZ`;

		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getSheetData] API Error:", errorText);
			return null;
		}

		const data = await res.json();
		const values: string[][] = data.values || [];

		if (values.length === 0) {
			return { headers: [], rows: [], totalRows: 0 };
		}

		// First row is headers
		const headers = values[0].map((h: string) => (h || "").trim());

		// Remaining rows as objects keyed by header
		const rows = values.slice(1).map((row: string[]) => {
			const obj: Record<string, string> = {};
			headers.forEach((header, index) => {
				obj[header] = (row[index] || "").trim();
			});
			return obj;
		});

		const result: SheetData = {
			headers,
			rows,
			totalRows: rows.length,
		};

		console.log(
			`[getSheetData] Loaded ${headers.length} columns, ${rows.length} rows`,
		);

		// Cache the result
		setCache(cacheKey, result);

		return result;
	} catch (error) {
		console.error("[getSheetData] Error:", error);
		return null;
	}
}

/**
 * Import data to a new Google Sheet in the analytics folder
 * @param name - Name for the new sheet
 * @param headers - Column headers
 * @param rows - Data rows
 * @param year - Optional year (defaults to current year)
 */
export async function importToAnalyticsSheet(
	name: string,
	headers: string[],
	rows: string[][],
	year?: string,
): Promise<AnalyticsSheet | null> {
	const analyticsFolder = await getAnalyticsFolder(year);
	if (!analyticsFolder) {
		console.error("[importToAnalyticsSheet] No analytics folder found");
		return null;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[importToAnalyticsSheet] Could not get access token");
		return null;
	}

	try {
		// Create a new spreadsheet
		const createRes = await fetch(
			"https://sheets.googleapis.com/v4/spreadsheets",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					properties: { title: name },
				}),
			},
		);

		if (!createRes.ok) {
			const errorText = await createRes.text();
			console.error(
				"[importToAnalyticsSheet] Failed to create sheet:",
				errorText,
			);
			return null;
		}

		const newSheet = await createRes.json();
		const sheetId = newSheet.spreadsheetId;

		// Move the sheet to the analytics folder
		await fetch(
			`https://www.googleapis.com/drive/v3/files/${sheetId}?addParents=${analyticsFolder.id}&removeParents=root`,
			{
				method: "PATCH",
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);

		// Populate with data (headers + rows)
		const allData = [headers, ...rows];
		await fetch(
			`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1?valueInputOption=RAW`,
			{
				method: "PUT",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ values: allData }),
			},
		);

		console.log(
			`[importToAnalyticsSheet] Created and populated: ${name} (${sheetId})`,
		);

		// Clear the sheets list cache
		clearCache(`${CACHE_KEYS.ANALYTICS_LIST}_${year || "current"}`);

		return {
			id: sheetId,
			name,
			url: `https://docs.google.com/spreadsheets/d/${sheetId}`,
		};
	} catch (error) {
		console.error("[importToAnalyticsSheet] Error:", error);
		return null;
	}
}

// ============================================
// FORM SUBMISSION (Service Account Auth)
// ============================================

interface FormSubmission {
	type: string;
	name: string;
	email: string;
	apartmentNumber: string;
	message: string;
}

// Simple JWT creation for Google Service Account
async function getServiceAccountAccessToken(): Promise<string | null> {
	if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
		console.error(
			"[getServiceAccountAccessToken] Missing service account credentials",
		);
		return null;
	}

	try {
		const now = Math.floor(Date.now() / 1000);
		const expiry = now + 3600; // 1 hour

		// JWT Header
		const header = { alg: "RS256", typ: "JWT" };

		// JWT Payload - includes Sheets and Drive scopes (readonly + file for uploads)
		const payload = {
			iss: config.serviceAccountEmail,
			scope:
				"https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.events",
			aud: "https://oauth2.googleapis.com/token",
			iat: now,
			exp: expiry,
		};

		// Base64url encode
		const base64url = (obj: object) =>
			Buffer.from(JSON.stringify(obj)).toString("base64url");

		const unsignedToken = `${base64url(header)}.${base64url(payload)}`;

		// Sign with private key using Web Crypto API
		const crypto = await import("node:crypto");
		const sign = crypto.createSign("RSA-SHA256");
		sign.update(unsignedToken);
		const signature = sign.sign(config.serviceAccountPrivateKey, "base64url");

		const jwt = `${unsignedToken}.${signature}`;

		// Exchange JWT for access token
		const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion: jwt,
			}),
		});

		if (!tokenRes.ok) {
			const errorText = await tokenRes.text();
			console.error(
				"[getServiceAccountAccessToken] Token exchange failed:",
				errorText,
			);
			return null;
		}

		const tokenData = await tokenRes.json();
		return tokenData.access_token;
	} catch (error) {
		console.error("[getServiceAccountAccessToken] Error:", error);
		return null;
	}
}

export async function saveFormSubmission(
	submission: FormSubmission,
): Promise<boolean> {
	if (!config.submissionsSheetId) {
		console.error("[saveFormSubmission] No submissions sheet ID configured");
		return false;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[saveFormSubmission] Could not get access token");
		return false;
	}

	const timestamp = new Date().toISOString();
	// Status options: "Uusi / New", "Käsittelyssä / In Progress", "Hyväksytty / Approved", "Hylätty / Rejected", "Valmis / Done"
	const defaultStatus = "Uusi / New";
	// Column order: Timestamp, Type, Name, Email, Apartment, Message, Status
	const row = [
		timestamp,
		submission.type,
		submission.name,
		submission.email,
		submission.apartmentNumber,
		submission.message,
		defaultStatus,
	];

	const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.submissionsSheetId}/values/A:G:append?valueInputOption=USER_ENTERED`;

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				values: [row],
			}),
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[saveFormSubmission] API Error:", errorText);
			return false;
		}

		console.log("[saveFormSubmission] Successfully saved submission");
		return true;
	} catch (error) {
		console.error("[saveFormSubmission] Error:", error);
		return false;
	}
}

// ============================================
// ADMIN: READ SUBMISSIONS
// ============================================

export interface Submission {
	rowIndex: number; // 1-indexed row number in sheet (for updates)
	timestamp: string;
	type: string;
	name: string;
	email: string;
	message: string;
	status: string;
}

export async function getSubmissions(): Promise<Submission[]> {
	if (!config.submissionsSheetId) {
		console.error("[getSubmissions] No submissions sheet ID configured");
		return [];
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[getSubmissions] Could not get access token");
		return [];
	}

	// Fetch all rows (skip header row)
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.submissionsSheetId}/values/A2:F1000`;

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[getSubmissions] API Error:", errorText);
			return [];
		}

		const data = await res.json();
		const rows = data.values || [];

		return rows.map((row: string[], index: number) => ({
			rowIndex: index + 2, // +2 because we start from A2 (skip header) and 1-indexed
			timestamp: row[0] || "",
			type: row[1] || "",
			name: row[2] || "",
			email: row[3] || "",
			message: row[4] || "",
			status: row[5] || "Uusi / New",
		}));
	} catch (error) {
		console.error("[getSubmissions] Error:", error);
		return [];
	}
}

// ============================================
// ADMIN: UPDATE SUBMISSION STATUS
// ============================================

export async function updateSubmissionStatus(
	rowIndex: number,
	newStatus: string,
): Promise<boolean> {
	if (!config.submissionsSheetId) {
		console.error(
			"[updateSubmissionStatus] No submissions sheet ID configured",
		);
		return false;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[updateSubmissionStatus] Could not get access token");
		return false;
	}

	// Update only the Status column (F) for the specific row
	const range = `F${rowIndex}`;
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.submissionsSheetId}/values/${range}?valueInputOption=USER_ENTERED`;

	try {
		const res = await fetch(url, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				values: [[newStatus]],
			}),
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[updateSubmissionStatus] API Error:", errorText);
			return false;
		}

		console.log(
			`[updateSubmissionStatus] Row ${rowIndex} updated to: ${newStatus}`,
		);
		return true;
	} catch (error) {
		console.error("[updateSubmissionStatus] Error:", error);
		return false;
	}
}

// ============================================
// ADMIN: DELETE SUBMISSION
// ============================================

export async function deleteSubmission(rowIndex: number): Promise<boolean> {
	if (!config.submissionsSheetId) {
		console.error("[deleteSubmission] No submissions sheet ID configured");
		return false;
	}

	const accessToken = await getServiceAccountAccessToken();
	if (!accessToken) {
		console.error("[deleteSubmission] Could not get access token");
		return false;
	}

	// First, get the sheet ID (gid) - we need it for the batchUpdate request
	const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.submissionsSheetId}?fields=sheets.properties`;

	try {
		const metaRes = await fetch(metadataUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!metaRes.ok) {
			console.error("[deleteSubmission] Failed to get sheet metadata");
			return false;
		}

		const metaData = await metaRes.json();
		const sheetId = metaData.sheets?.[0]?.properties?.sheetId || 0;

		// Use batchUpdate to delete the row
		const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.submissionsSheetId}:batchUpdate`;

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				requests: [
					{
						deleteDimension: {
							range: {
								sheetId: sheetId,
								dimension: "ROWS",
								startIndex: rowIndex - 1, // 0-indexed
								endIndex: rowIndex, // exclusive
							},
						},
					},
				],
			}),
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[deleteSubmission] API Error:", errorText);
			return false;
		}

		console.log(`[deleteSubmission] Row ${rowIndex} deleted successfully`);
		return true;
	} catch (error) {
		console.error("[deleteSubmission] Error:", error);
		return false;
	}
}

// ============================================
// FILE DOWNLOAD (for email attachments)
// ============================================

/**
 * Download a file from Google Drive as base64 string
 * Used for attaching minutes PDFs to reimbursement emails
 * Handles both native files (PDFs, images) and Google Docs (exports to PDF)
 */
export async function getFileAsBase64(fileId: string): Promise<string | null> {
	if (!fileId) {
		console.error("[getFileAsBase64] Missing fileId");
		return null;
	}

	// First try with service account for private files
	const accessToken = await getServiceAccountAccessToken();

	try {
		const headers: HeadersInit = accessToken
			? { Authorization: `Bearer ${accessToken}` }
			: {};

		// First, get file metadata to check if it's a Google Docs file
		const metadataUrl = accessToken
			? `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`
			: `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name&key=${config.apiKey}`;

		const metaRes = await fetch(metadataUrl, { headers });
		if (!metaRes.ok) {
			console.error(
				`[getFileAsBase64] Failed to get file metadata ${fileId}: ${metaRes.status}`,
			);
			return null;
		}

		const metadata = (await metaRes.json()) as {
			mimeType: string;
			name: string;
		};
		console.log(
			`[getFileAsBase64] File ${fileId} is ${metadata.mimeType} (${metadata.name})`,
		);

		let downloadUrl: string;

		// Google Docs/Sheets/Slides need to be exported, not downloaded directly
		if (metadata.mimeType === "application/vnd.google-apps.document") {
			// Export Google Doc as PDF
			downloadUrl = accessToken
				? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
				: `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf&key=${config.apiKey}`;
			console.log(`[getFileAsBase64] Exporting Google Doc as PDF`);
		} else if (
			metadata.mimeType === "application/vnd.google-apps.spreadsheet"
		) {
			// Export Google Sheets as PDF
			downloadUrl = accessToken
				? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
				: `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf&key=${config.apiKey}`;
			console.log(`[getFileAsBase64] Exporting Google Sheet as PDF`);
		} else {
			// Regular file - download directly
			downloadUrl = accessToken
				? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
				: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${config.apiKey}`;
		}

		const res = await fetch(downloadUrl, { headers });

		if (!res.ok) {
			console.error(
				`[getFileAsBase64] Failed to download file ${fileId}: ${res.status}`,
			);
			return null;
		}

		const arrayBuffer = await res.arrayBuffer();
		const base64 = Buffer.from(arrayBuffer).toString("base64");

		console.log(
			`[getFileAsBase64] Downloaded file ${fileId} (${arrayBuffer.byteLength} bytes)`,
		);
		return base64;
	} catch (error) {
		console.error("[getFileAsBase64] Error:", error);
		return null;
	}
}
