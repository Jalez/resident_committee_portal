import "dotenv/config";
import {
	createSqlClient,
	ensureColumn,
	ensureForeignKey,
	getColumns,
	type SqlClient,
} from "./db-utils";

async function ensureDefaultAndNotNull(
	sql: SqlClient,
	table: string,
	column: string,
	defaultValue: string,
) {
	const columns = await getColumns(sql, table);
	if (!columns.has(column)) return;

	await sql.unsafe(
		`alter table "${table}" alter column "${column}" set default ${defaultValue}`,
	);
	await sql.unsafe(
		`alter table "${table}" alter column "${column}" set not null`,
	);
}

async function main() {
	const sql = createSqlClient();

	try {
		let changed = 0;

		// roles.permissions
		if (
			await ensureColumn(
				sql,
				"roles",
				"permissions",
				"\"permissions\" text[]",
			)
		) {
			changed++;
		}
		await sql`
			update roles
			set permissions = coalesce(permissions, '{}')
		`;
		await sql.unsafe(
			"alter table \"roles\" alter column \"permissions\" set default '{}'",
		);
		await sql.unsafe(
			"alter table \"roles\" alter column \"permissions\" set not null",
		);

		// users languages
		if (
			await ensureColumn(
				sql,
				"users",
				"primary_language",
				"\"primary_language\" text",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"users",
				"secondary_language",
				"\"secondary_language\" text",
			)
		) {
			changed++;
		}
		await sql`
			update users
			set primary_language = coalesce(nullif(primary_language, ''), 'fi'),
				secondary_language = coalesce(nullif(secondary_language, ''), 'en')
		`;
		await ensureDefaultAndNotNull(sql, "users", "primary_language", "'fi'");
		await ensureDefaultAndNotNull(sql, "users", "secondary_language", "'en'");

		// inventory_items
		if (
			await ensureColumn(
				sql,
				"inventory_items",
				"manual_count",
				"\"manual_count\" integer",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"inventory_items",
				"show_in_info_reel",
				"\"show_in_info_reel\" boolean",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"inventory_items",
				"status",
				"\"status\" text",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"inventory_items",
				"removed_at",
				"\"removed_at\" timestamp",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"inventory_items",
				"removal_reason",
				"\"removal_reason\" text",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"inventory_items",
				"removal_notes",
				"\"removal_notes\" text",
			)
		) {
			changed++;
		}
		await sql`
			update inventory_items
			set manual_count = coalesce(manual_count, 0),
				show_in_info_reel = coalesce(show_in_info_reel, false),
				status = coalesce(nullif(status, ''), 'active')
		`;
		await ensureDefaultAndNotNull(
			sql,
			"inventory_items",
			"manual_count",
			"0",
		);
		await ensureDefaultAndNotNull(
			sql,
			"inventory_items",
			"show_in_info_reel",
			"false",
		);
		await ensureDefaultAndNotNull(
			sql,
			"inventory_items",
			"status",
			"'active'",
		);

		// purchases email tracking
		if (
			await ensureColumn(
				sql,
				"purchases",
				"email_message_id",
				"\"email_message_id\" text",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"purchases",
				"email_reply_received",
				"\"email_reply_received\" boolean",
			)
		) {
			changed++;
		}
		if (
			await ensureColumn(
				sql,
				"purchases",
				"email_reply_content",
				"\"email_reply_content\" text",
			)
		) {
			changed++;
		}
		await sql`
			update purchases
			set email_reply_received = coalesce(email_reply_received, false)
		`;
		await ensureDefaultAndNotNull(
			sql,
			"purchases",
			"email_reply_received",
			"false",
		);

		// Foreign keys
		if (
			await ensureForeignKey(sql, {
				table: "users",
				column: "role_id",
				refTable: "roles",
				refColumn: "id",
				constraintName: "users_role_id_roles_id_fk",
				onDelete: "no action",
				onUpdate: "no action",
			})
		) {
			changed++;
		}
		if (
			await ensureForeignKey(sql, {
				table: "purchases",
				column: "inventory_item_id",
				refTable: "inventory_items",
				refColumn: "id",
				constraintName: "purchases_inventory_item_id_inventory_items_id_fk",
				onDelete: "no action",
				onUpdate: "no action",
			})
		) {
			changed++;
		}
		if (
			await ensureForeignKey(sql, {
				table: "transactions",
				column: "purchase_id",
				refTable: "purchases",
				refColumn: "id",
				constraintName: "transactions_purchase_id_purchases_id_fk",
				onDelete: "no action",
				onUpdate: "no action",
			})
		) {
			changed++;
		}
		if (
			await ensureForeignKey(sql, {
				table: "inventory_item_transactions",
				column: "inventory_item_id",
				refTable: "inventory_items",
				refColumn: "id",
				constraintName:
					"inventory_item_transactions_inventory_item_id_inventory_items_id_fk",
				onDelete: "no action",
				onUpdate: "no action",
			})
		) {
			changed++;
		}
		if (
			await ensureForeignKey(sql, {
				table: "inventory_item_transactions",
				column: "transaction_id",
				refTable: "transactions",
				refColumn: "id",
				constraintName:
					"inventory_item_transactions_transaction_id_transactions_id_fk",
				onDelete: "no action",
				onUpdate: "no action",
			})
		) {
			changed++;
		}

		console.log(`\nMigration complete. Changes applied: ${changed}`);
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error("migrate-neon failed:", error);
	process.exit(1);
});
