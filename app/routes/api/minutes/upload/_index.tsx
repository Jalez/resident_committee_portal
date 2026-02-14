import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, requireAnyPermission } from "~/lib/auth.server";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { buildMinutePath, getMinutesPrefix } from "~/lib/minutes/utils";

// Allowed file types for minutes (PDF, Docx, etc.)
const ALLOWED_MIME_TYPES = [
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
]; // Add more if needed

function isSafePathname(pathname: string): boolean {
	const prefix = getMinutesPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function action({ request }: ActionFunctionArgs) {
	try {
		if (request.method !== "POST") {
			return new Response(JSON.stringify({ error: "Method not allowed" }), {
				status: 405,
				headers: { "Content-Type": "application/json" },
			});
		}

		await requireAnyPermission(request, ["minutes:write"], getDatabase);

		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const dateStr = formData.get("date") as string | null; // YYYY-MM-DD
		const title = formData.get("title") as string | null;
		const description = formData.get("description") as string | null;

		if (!file) {
			return new Response(JSON.stringify({ error: "File is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (!dateStr || !title) {
			return new Response(
				JSON.stringify({ error: "Date and Title are required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Validate MIME type
		if (!ALLOWED_MIME_TYPES.includes(file.type)) {
			return new Response(
				JSON.stringify({
					error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const date = new Date(dateStr);
		if (Number.isNaN(date.getTime())) {
			return new Response(JSON.stringify({ error: "Invalid date" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		const year = date.getFullYear();
		const pathname = buildMinutePath(year.toString(), file.name);

		if (!isSafePathname(pathname)) {
			return new Response(JSON.stringify({ error: "Invalid pathname" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const storage = getMinuteStorage();
		const result = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});

		// Create Database Record
		const db = getDatabase();
		const user = await getAuthenticatedUser(request, () => db);

		const minute = await db.createMinute({
			date,
			year,
			title,
			description: description || null,
			fileUrl: result.url,
			fileKey: result.pathname,
			createdBy: user?.userId || null,
		});

		return Response.json({
			minute,
		});
	} catch (error) {
		console.error("[minutes upload-action.server]", error);
		const message = error instanceof Error ? error.message : "Upload failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
