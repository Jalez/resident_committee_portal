import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useFormatDate } from "~/hooks/use-format-date";
import { AddItemButton } from "~/components/add-item-button";
import {
	TREASURY_TRANSACTION_STATUS_VARIANTS,
	TREASURY_TRANSACTION_TYPE_VARIANTS,
} from "~/components/colored-status-link-badge";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { RelationsColumn } from "~/components/relations-column";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import {
	TREASURY_TABLE_STYLES,
	TreasuryTable,
} from "~/components/treasury/treasury-table";
import { ViewScopeDisclaimer } from "~/components/treasury/view-scope-disclaimer";
import { useUser } from "~/contexts/user-context";
import { getDatabase, type Transaction } from "~/db/server.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Tapahtumat / Transactions`,
		},
		{
			name: "description",
			content: "Kaikki rahastotapahtumat / All treasury transactions",
		},
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(
		request,
		["treasury:transactions:read", "treasury:transactions:read-self"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const canReadAll = hasAnyPermission(user, ["treasury:transactions:read"]);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const statusParam = url.searchParams.get("status");
	const typeParam = url.searchParams.get("type");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		throw new Response("Invalid year", { status: 400 });
	}

	let allTransactions = await db.getTransactionsByYear(year);

	if (!canReadAll) {
		allTransactions = allTransactions.filter(
			(t) => t.createdBy === user.userId,
		);
	}

	let transactions = allTransactions;
	if (statusParam && statusParam !== "all") {
		transactions = transactions.filter((t) => t.status === statusParam);
	}

	if (typeParam && typeParam !== "all") {
		transactions = transactions.filter((t) => t.type === typeParam);
	}

	const sortedTransactions = transactions.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	const totalExpenses = allTransactions
		.filter((t) => t.type === "expense")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const totalIncome = allTransactions
		.filter((t) => t.type === "income")
		.reduce((sum, t) => sum + parseFloat(t.amount), 0);

	const allYearTransactions = await db.getAllTransactions();
	const years = [...new Set(allYearTransactions.map((t) => t.year))].sort(
		(a, b) => b - a,
	);

	const status = [...new Set(allTransactions.map((t) => t.status))];

	const creatorIds = [
		...new Set(
			sortedTransactions
				.map((t) => t.createdBy)
				.filter((id): id is string => Boolean(id)),
		),
	];
	const creatorUsers = await Promise.all(
		creatorIds.map((id) => db.findUserById(id)),
	);
	const creatorsMap = new Map<string, string>();
	creatorIds.forEach((id, i) => {
		if (creatorUsers[i]) creatorsMap.set(id, creatorUsers[i].name);
	});

	const transactionIds = sortedTransactions.map((t) => t.id);
	const relationsMap = await loadRelationsMapForEntities(
		db,
		"transaction",
		transactionIds,
		undefined,
		user.permissions,
	);

	const transactionLockMap = new Map<string, boolean>();
	for (const transaction of sortedTransactions) {
		const relations = relationsMap.get(transaction.id) || [];
		const reimbursementRel = relations.find((r) => r.type === "reimbursement");
		if (reimbursementRel) {
			const purchase = await db.getPurchaseById(reimbursementRel.id);
			if (purchase && purchase.emailSent && purchase.status !== "rejected") {
				transactionLockMap.set(transaction.id, true);
			}
		}
	}

	const systemLanguages = await getSystemLanguageDefaults();

	const serializedRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of relationsMap) {
		serializedRelationsMap[id] = relations;
	}

	return {
		siteConfig: SITE_CONFIG,
		year,
		transactions: sortedTransactions,
		totalExpenses,
		totalIncome,
		years,
		status,
		currentStatus: statusParam || "all",
		totalCount: allTransactions.length,
		canReadAll,
		transactionLockMap: Object.fromEntries(transactionLockMap),
		systemLanguages,
		creatorsMap: Object.fromEntries(creatorsMap),
		relationsMap: serializedRelationsMap,
	};
}

export default function TreasuryTransactions({
	loaderData,
}: Route.ComponentProps) {
	const {
		year,
		transactions,
		years,
		status,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
		canReadAll,
		transactionLockMap: transactionLockMapRaw,
		relationsMap: relationsMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const transactionLockMap = new Map(
		Object.entries(transactionLockMapRaw ?? {}) as [string, boolean][],
	);
	const relationsMap = new Map(
		Object.entries(relationsMapRaw ?? {}) as [string, RelationBadgeData[]][],
	);
	const [searchParams, setSearchParams] = useSearchParams();
	const { hasPermission, user } = useUser();
	const canEditGeneral = hasPermission("treasury:transactions:update");
	const canEditSelf = hasPermission("treasury:transactions:update-self");
	const canWrite = hasPermission("treasury:transactions:write");
	const canExport = hasPermission("treasury:transactions:export");
	const canImport = hasPermission("treasury:transactions:import");

	const canEditTransaction = (transaction: Transaction) => {
		if (canEditGeneral) return true;
		if (
			canEditSelf &&
			transaction.createdBy &&
			user &&
			transaction.createdBy === user.userId
		) {
			return true;
		}
		return false;
	};

	const canDeleteTransaction = (transaction: Transaction) => {
		const canDeleteGeneral = hasPermission("treasury:transactions:delete");
		const canDeleteSelf =
			hasPermission("treasury:transactions:delete-self") &&
			transaction.createdBy &&
			user?.userId === transaction.createdBy;
		return canDeleteGeneral || canDeleteSelf;
	};
	const { t, i18n } = useTranslation();
	const { formatDate } = useFormatDate();

	const formatCurrency = (value: number | string) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	useEffect(() => {
		const success = searchParams.get("success");
		if (success !== "transaction_deleted") return;
		toast.success(t("treasury.success.transaction_deleted"));
		setSearchParams((prev) => {
			prev.delete("success");
			return prev;
		});
	}, [searchParams, setSearchParams, t]);

	const statusOptions = ["all", ...status];
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options:
				years.length > 0
					? years.map(String)
					: [String(new Date().getFullYear())],
		},
		{
			name: "status",
			label: t("common.fields.status"),
			type: "select",
			placeholder: t("treasury.transactions.all"),
			options: statusOptions,
		},
		{
			name: "type",
			label: t("treasury.transactions.type"),
			type: "select",
			placeholder: t("common.actions.all"),
			options: ["all", "income", "expense"],
		},
	];

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2 min-h-[40px]">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					title={t("treasury.transactions.new")}
					variant="icon"
					createType="transaction"
				/>
			)}
		</div>
	);

	const columns = [
		{
			key: "date",
			header: t("treasury.breakdown.date"),
			cell: (row: Transaction) => formatDate(row.date),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "description",
			header: t("treasury.breakdown.description"),
			cell: (row: Transaction) => (
				<div className={TREASURY_TABLE_STYLES.DESCRIPTION_CELL}>
					{row.description}
				</div>
			),
			cellClassName: "font-medium",
		},
		{
			key: "type",
			header: t("treasury.transactions.type"),
			cell: (row: Transaction) => (
				<TreasuryStatusPill
					value={row.type}
					variantMap={TREASURY_TRANSACTION_TYPE_VARIANTS}
					label={t(`treasury.types.${row.type}`, {
						defaultValue: row.type,
					})}
				/>
			),
		},
		{
			key: "status",
			header: t("treasury.transactions.status"),
			cell: (row: Transaction) => (
				<TreasuryStatusPill
					value={row.status}
					variantMap={TREASURY_TRANSACTION_STATUS_VARIANTS}
					label={t(`treasury.breakdown.edit.status.${row.status}`, {
						defaultValue: row.status,
					})}
				/>
			),
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: Transaction) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "relations",
			header: t("common.relations.title"),
			headerClassName: "text-center",
			cellClassName: "text-center",
			cell: (row: Transaction) => (
				<RelationsColumn relations={relationsMap.get(row.id) || []} />
			),
		},
		{
			key: "amount",
			header: t("treasury.breakdown.amount"),
			headerClassName: "text-right",
			align: "right" as const,
			cell: (row: Transaction) => (
				<>
					{row.type === "expense" ? "-" : "+"}
					{formatCurrency(row.amount)}
				</>
			),
			cellClassName: (row: Transaction) =>
				`${TREASURY_TABLE_STYLES.AMOUNT_CELL} ${row.type === "expense"
					? TREASURY_TABLE_STYLES.AMOUNT_EXPENSE
					: TREASURY_TABLE_STYLES.AMOUNT_INCOME
				}`,
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.transactions.title", {
						lng: systemLanguages.primary,
					}),
					secondary: t("treasury.transactions.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				canExport={canExport}
				canImport={canImport}
				exportQueryParams={{ year: String(year) }}
				importExtraFields={{ year: String(year) }}
				footer={footerContent}
			>
				<div className="space-y-6">
					<ViewScopeDisclaimer
						canReadAll={canReadAll}
						itemType="transactions"
					/>
					<TreasuryTable<Transaction>
						data={transactions}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(transaction) => (
							<TreasuryActionCell
								viewTo={`/treasury/transactions/${transaction.id}`}
								viewTitle={t("common.actions.view")}
								editTo={`/treasury/transactions/${transaction.id}/edit`}
								editTitle={t("common.actions.edit")}
								canEdit={
									canEditTransaction(transaction) &&
									!transactionLockMap.get(transaction.id)
								}
								deleteProps={
									canDeleteTransaction(transaction)
										? {
											action: `/treasury/transactions/${transaction.id}/delete`,
											hiddenFields: {},
											confirmMessage: t(
												"treasury.breakdown.edit.delete_confirm",
											),
											title: t("common.actions.delete"),
										}
										: undefined
								}
							/>
						)}
						emptyState={{
							title: t("treasury.breakdown.no_transactions"),
						}}
						totals={{
							labelColSpan: 7,
							columns: [
								{
									value: transactions.reduce((sum, tx) => {
										const amount = parseFloat(tx.amount);
										return sum + (tx.type === "expense" ? -amount : amount);
									}, 0),
								},
							],
							trailingColSpan: 1,
							formatCurrency,
						}}
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
