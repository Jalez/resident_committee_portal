interface GoogleConfig {
	apiKey: string;
	calendarId: string;
	publicRootFolderId: string;
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

const config: GoogleConfig = {
	apiKey: process.env.GOOGLE_API_KEY || "",
	calendarId: process.env.GOOGLE_CALENDAR_ID || "",
	publicRootFolderId: process.env.GOOGLE_DRIVE_PUBLIC_ROOT_ID || "",
	serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
	serviceAccountPrivateKey: (
		process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
	).replace(/\\n/g, "\n"),
	submissionsSheetId: process.env.GOOGLE_SUBMISSIONS_SHEET_ID || "",
};

// Debug: Log config on server start (mask sensitive data)
console.log("[Google Config]", {
	apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...` : "MISSING",
	calendarId: config.calendarId || "MISSING",
	publicRootFolderId: config.publicRootFolderId || "MISSING",
	serviceAccountEmail: config.serviceAccountEmail || "MISSING",
	serviceAccountPrivateKey: config.serviceAccountPrivateKey ? "SET" : "MISSING",
	submissionsSheetId: config.submissionsSheetId || "MISSING",
});

// Helper: Find a file or folder by name inside a parent folder
async function findChildByName(
	parentId: string,
	name: string,
	mimeType?: string,
) {
	if (!config.apiKey || !parentId) {
		console.log(
			`[findChildByName] Skipped: apiKey=${!!config.apiKey}, parentId=${parentId}`,
		);
		return null;
	}

	let q = `'${parentId}' in parents and name = '${name}' and trashed = false`;
	if (mimeType) {
		q += ` and mimeType = '${mimeType}'`;
	}

	const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&key=${config.apiKey}&fields=files(id,name,webViewLink)`;

	try {
		console.log(
			`[findChildByName] Query: name='${name}' in parent='${parentId}'`,
		);
		const res = await fetch(url);
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
	const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=name desc&key=${config.apiKey}&fields=files(id,name,webViewLink,createdTime)`;

	try {
		const res = await fetch(url);
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

	if (!config.apiKey || !config.publicRootFolderId) {
		console.log("[getMinutesByYear] Missing config");
		return [];
	}

	// Step 1: List all year folders in the public root
	const q = `'${config.publicRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
	const foldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&key=${config.apiKey}&fields=files(id,name,webViewLink)&orderBy=name desc`;

	try {
		const foldersRes = await fetch(foldersUrl);
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
				const filesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQ)}&orderBy=name desc&key=${config.apiKey}&fields=files(id,name,webViewLink,createdTime)`;

				try {
					const filesRes = await fetch(filesUrl);
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

	if (!config.apiKey || !config.publicRootFolderId) {
		console.log("[getReceiptsByYear] Missing config");
		return [];
	}

	// Step 1: List all year folders in the public root
	const q = `'${config.publicRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
	const foldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&key=${config.apiKey}&fields=files(id,name,webViewLink)&orderBy=name desc`;

	try {
		const foldersRes = await fetch(foldersUrl);
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
				const filesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQ)}&orderBy=name desc&key=${config.apiKey}&fields=files(id,name,webViewLink,createdTime)`;

				try {
					const filesRes = await fetch(filesUrl);
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

	// Fetch data starting from row 2 (skip header), columns A:F
	const range = "A2:F";
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${inventoryFile.id}/values/${range}?key=${config.apiKey}`;

	try {
		const res = await fetch(url);
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

	// Fetch data starting from row 2 (skip header), columns A:F
	const range = "A2:F";
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${inventoryFile.id}/values/${range}?key=${config.apiKey}`;

	try {
		const res = await fetch(url);
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

	// Fetch data starting from row 2 (skip header), columns A:D (name, icon, url, color)
	const range = "A2:D";
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${someFile.id}/values/${range}?key=${config.apiKey}`;

	try {
		const res = await fetch(url);
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

		// JWT Payload - includes both Sheets and Drive scopes
		const payload = {
			iss: config.serviceAccountEmail,
			scope:
				"https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
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
 */
export async function getFileAsBase64(fileId: string): Promise<string | null> {
	if (!fileId) {
		console.error("[getFileAsBase64] Missing fileId");
		return null;
	}

	// First try with service account for private files
	const accessToken = await getServiceAccountAccessToken();

	try {
		let url: string;
		let headers: HeadersInit = {};

		if (accessToken) {
			// Use service account auth for potentially private files
			url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
			headers = { Authorization: `Bearer ${accessToken}` };
		} else {
			// Fallback to API key for public files
			url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${config.apiKey}`;
		}

		const res = await fetch(url, { headers });

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
