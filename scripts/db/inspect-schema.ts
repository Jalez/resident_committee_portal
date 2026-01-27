import "dotenv/config";
import { createSqlClient, getColumns } from "./db-utils";

const EXPECTED_COLUMNS: Record<string, string[]> = {
	roles: [
		"id",
		"name",
		"description",
		"color",
		"is_system",
		"sort_order",
		"permissions",
		"created_at",
		"updated_at",
	],
	users: [
		"id",
		"email",
		"name",
		"role_id",
		"apartment_number",
		"primary_language",
		"secondary_language",
		"created_at",
		"updated_at",
	],
	inventory_items: [
		"id",
		"name",
		"quantity",
		"manual_count",
		"location",
		"category",
		"description",
		"value",
		"show_in_info_reel",
		"status",
		"removed_at",
		"removal_reason",
		"removal_notes",
		"purchased_at",
		"created_at",
		"updated_at",
	],
	purchases: [
		"id",
		"inventory_item_id",
		"description",
		"amount",
		"purchaser_name",
		"bank_account",
		"minutes_id",
		"minutes_name",
		"notes",
		"status",
		"email_sent",
		"email_error",
		"email_message_id",
		"email_reply_received",
		"email_reply_content",
		"year",
		"created_at",
		"updated_at",
	],
	transactions: [
		"id",
		"year",
		"type",
		"amount",
		"description",
		"category",
		"date",
		"status",
		"reimbursement_status",
		"purchase_id",
		"created_at",
		"updated_at",
	],
	inventory_item_transactions: [
		"id",
		"inventory_item_id",
		"transaction_id",
		"quantity",
		"created_at",
	],
	submissions: [
		"id",
		"type",
		"name",
		"email",
		"apartment_number",
		"message",
		"status",
		"created_at",
		"updated_at",
	],
	social_links: [
		"id",
		"name",
		"icon",
		"url",
		"color",
		"sort_order",
		"is_active",
		"created_at",
		"updated_at",
	],
	app_settings: ["key", "value", "description", "updated_at"],
};

async function main() {
	const sql = createSqlClient();

	try {
		for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
			const existing = await getColumns(sql, table);
			const missing = expected.filter((col) => !existing.has(col));
			console.log(`\n${table}`);
			if (missing.length === 0) {
				console.log("  ✓ no missing columns");
			} else {
				console.log(`  ✗ missing: ${missing.join(", ")}`);
			}
		}
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error("inspect-schema failed:", error);
	process.exit(1);
});
