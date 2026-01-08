
interface GoogleConfig {
    apiKey: string;
    calendarId: string;
    publicRootFolderId: string;
    // Service account for writing
    serviceAccountEmail: string;
    serviceAccountPrivateKey: string;
    submissionsSheetId: string;
}

const config: GoogleConfig = {
    apiKey: process.env.GOOGLE_API_KEY || "",
    calendarId: process.env.GOOGLE_CALENDAR_ID || "",
    publicRootFolderId: process.env.GOOGLE_DRIVE_PUBLIC_ROOT_ID || "",
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    serviceAccountPrivateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
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
async function findChildByName(parentId: string, name: string, mimeType?: string) {
    if (!config.apiKey || !parentId) {
        console.log(`[findChildByName] Skipped: apiKey=${!!config.apiKey}, parentId=${parentId}`);
        return null;
    }

    let q = `'${parentId}' in parents and name = '${name}' and trashed = false`;
    if (mimeType) {
        q += ` and mimeType = '${mimeType}'`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&key=${config.apiKey}&fields=files(id,name,webViewLink)`;

    try {
        console.log(`[findChildByName] Query: name='${name}' in parent='${parentId}'`);
        const res = await fetch(url);
        if (!res.ok) {
            console.log(`[findChildByName] API Error: ${res.status} ${res.statusText}`);
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
import { getCached, setCache, CACHE_TTL, CACHE_KEYS } from "./cache.server";

export async function getCalendarEvents() {
    // Check cache first
    const cached = getCached<any[]>(CACHE_KEYS.CALENDAR_EVENTS, CACHE_TTL.CALENDAR_EVENTS);
    if (cached !== null) {
        return cached;
    }

    if (!config.apiKey || !config.calendarId) {
        console.log("[getCalendarEvents] Skipped: missing config", { apiKey: !!config.apiKey, calendarId: !!config.calendarId });
        return [];
    }

    const now = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?key=${config.apiKey}&timeMin=${now}&singleEvents=true&orderBy=startTime&maxResults=10`;

    console.log(`[getCalendarEvents] Fetching events for calendar: ${config.calendarId}`);

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
        console.error("[getCalendarEvents] Fetch error:", error);
        return [];
    }
}

// Helper to get the Current Year Folder ID (from PUBLIC root)
async function getCurrentYearFolder() {
    if (!config.publicRootFolderId) {
        console.log("[getCurrentYearFolder] No publicRootFolderId configured");
        return null;
    }
    const currentYear = new Date().getFullYear().toString();
    console.log(`[getCurrentYearFolder] Looking for folder '${currentYear}' in root '${config.publicRootFolderId}'`);
    const folder = await findChildByName(config.publicRootFolderId, currentYear, "application/vnd.google-apps.folder");
    console.log(`[getCurrentYearFolder] Result:`, folder ? folder.id : "NOT FOUND");
    return folder;
}

export async function getMinutesFiles() {
    // Check cache first
    const cached = getCached<{ files: any[]; folderUrl: string }>(CACHE_KEYS.MINUTES, CACHE_TTL.MINUTES);
    if (cached !== null) {
        return cached;
    }

    const yearFolder = await getCurrentYearFolder();
    if (!yearFolder) return { files: [], folderUrl: "#" };

    const minutesFolder = await findChildByName(yearFolder.id, "minutes", "application/vnd.google-apps.folder");
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
            folderUrl: minutesFolder.webViewLink
        };

        // Cache the result
        setCache(CACHE_KEYS.MINUTES, result);

        return result;
    } catch (error) {
        console.error(error);
        return { files: [], folderUrl: "#" };
    }
}

export async function getBudgetInfo() {
    // Check cache first
    const cached = getCached<{ remaining: string; total: string; lastUpdated: string }>(CACHE_KEYS.BUDGET, CACHE_TTL.BUDGET);
    if (cached !== null) {
        return cached;
    }

    const yearFolder = await getCurrentYearFolder();
    if (!yearFolder) return null;

    // Look for "budget" spreadsheet
    let budgetFile = await findChildByName(yearFolder.id, "budget", "application/vnd.google-apps.spreadsheet");

    // If not found, maybe they named it "budget.csv" but it IS a spreadsheet
    if (!budgetFile) {
        budgetFile = await findChildByName(yearFolder.id, "budget.csv", "application/vnd.google-apps.spreadsheet");
    }

    if (!budgetFile) return null;

    const range = "B2:B4";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${budgetFile.id}/values/${range}?key=${config.apiKey}`;

    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const values = data.values;
        if (!values) return null;

        const result = {
            remaining: values[0]?.[0] || "--- €",
            total: values[1]?.[0] || "--- €",
            lastUpdated: values[2]?.[0] || ""
        };

        // Cache the result
        setCache(CACHE_KEYS.BUDGET, result);

        return result;
    } catch (error) {
        console.error("Budget fetch error:", error);
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
    message: string;
}

// Simple JWT creation for Google Service Account
async function getServiceAccountAccessToken(): Promise<string | null> {
    if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
        console.error("[getServiceAccountAccessToken] Missing service account credentials");
        return null;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + 3600; // 1 hour

        // JWT Header
        const header = { alg: "RS256", typ: "JWT" };

        // JWT Payload
        const payload = {
            iss: config.serviceAccountEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: expiry,
        };

        // Base64url encode
        const base64url = (obj: object) =>
            Buffer.from(JSON.stringify(obj)).toString("base64url");

        const unsignedToken = `${base64url(header)}.${base64url(payload)}`;

        // Sign with private key using Web Crypto API
        const crypto = await import("crypto");
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
            console.error("[getServiceAccountAccessToken] Token exchange failed:", errorText);
            return null;
        }

        const tokenData = await tokenRes.json();
        return tokenData.access_token;
    } catch (error) {
        console.error("[getServiceAccountAccessToken] Error:", error);
        return null;
    }
}

export async function saveFormSubmission(submission: FormSubmission): Promise<boolean> {
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
    const row = [timestamp, submission.type, submission.name, submission.email, submission.message, defaultStatus];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.submissionsSheetId}/values/A:F:append?valueInputOption=USER_ENTERED`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
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
    rowIndex: number;  // 1-indexed row number in sheet (for updates)
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
            rowIndex: index + 2,  // +2 because we start from A2 (skip header) and 1-indexed
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

export async function updateSubmissionStatus(rowIndex: number, newStatus: string): Promise<boolean> {
    if (!config.submissionsSheetId) {
        console.error("[updateSubmissionStatus] No submissions sheet ID configured");
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

        console.log(`[updateSubmissionStatus] Row ${rowIndex} updated to: ${newStatus}`);
        return true;
    } catch (error) {
        console.error("[updateSubmissionStatus] Error:", error);
        return false;
    }
}
