import postgres from "postgres";

export type SqlClient = ReturnType<typeof postgres>;

export function createSqlClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is required");
	}
	return postgres(connectionString, { prepare: false });
}

export async function getColumns(
	sql: SqlClient,
	table: string,
): Promise<Set<string>> {
	const rows = await sql<{ column_name: string }[]>`
		select column_name
		from information_schema.columns
		where table_schema = 'public'
			and table_name = ${table}
	`;
	return new Set(rows.map((row) => row.column_name));
}

export async function hasConstraint(
	sql: SqlClient,
	table: string,
	constraintName: string,
): Promise<boolean> {
	const rows = await sql<{ constraint_name: string }[]>`
		select constraint_name
		from information_schema.table_constraints
		where table_schema = 'public'
			and table_name = ${table}
			and constraint_name = ${constraintName}
	`;
	return rows.length > 0;
}

export async function ensureColumn(
	sql: SqlClient,
	table: string,
	column: string,
	definitionSql: string,
): Promise<boolean> {
	const columns = await getColumns(sql, table);
	if (columns.has(column)) return false;

	await sql.unsafe(`alter table "${table}" add column ${definitionSql}`);
	return true;
}

export async function ensureForeignKey(
	sql: SqlClient,
	options: {
		table: string;
		column: string;
		refTable: string;
		refColumn: string;
		constraintName: string;
		onDelete?: string;
		onUpdate?: string;
	},
): Promise<boolean> {
	const exists = await hasConstraint(sql, options.table, options.constraintName);
	if (exists) return false;

	const onDelete = options.onDelete ? ` on delete ${options.onDelete}` : "";
	const onUpdate = options.onUpdate ? ` on update ${options.onUpdate}` : "";

	await sql.unsafe(
		`alter table "${options.table}" add constraint "${options.constraintName}" foreign key ("${options.column}") references "${options.refTable}"("${options.refColumn}")${onDelete}${onUpdate}`,
	);
	return true;
}
