import { type ActionFunctionArgs, data } from "react-router";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";

export async function action({ request }: ActionFunctionArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	if (!authUser) {
		return data({ success: false, error: "Unauthorized" }, { status: 401 });
	}

	const db = getDatabase();
	const user = await db.findUserByEmail(authUser.email);

	if (!user) {
		return data({ success: false, error: "User not found" }, { status: 404 });
	}

	// Accept JSON body with array of message IDs and action type
	const body = await request.json();
	const messageIds = body.messageIds as string[];
	const action = (body.action as "read" | "unread") || "read";

	if (!Array.isArray(messageIds) || messageIds.length === 0) {
		return data(
			{ success: false, error: "Invalid messageIds array" },
			{ status: 400 },
		);
	}

	// Mark each message as read or unread
	const results = await Promise.all(
		messageIds.map((messageId) =>
			action === "read"
				? db.markMessageAsRead(messageId)
				: db.markMessageAsUnread(messageId),
		),
	);

	// Count successful marks (non-null results)
	const successCount = results.filter((r) => r !== null).length;

	return data({
		success: true,
		markedCount: successCount,
		totalRequested: messageIds.length,
		action,
	});
}
