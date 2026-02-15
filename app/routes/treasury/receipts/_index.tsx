import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { RelationsColumn } from "~/components/relations-column";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import {
	TREASURY_TABLE_STYLES,
	TreasuryTable,
} from "~/components/treasury/treasury-table";
import { ViewScopeDisclaimer } from "~/components/treasury/view-scope-disclaimer";
import { getDatabase, type Receipt } from "~/db/server.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Kuitit / Receipts`,
		},
		{ name: "robots", content: "noindex" } as const,
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(
		request,
		[
			"treasury:receipts:read",
			"treasury:receipts:read-self",
			"treasury:read",
			"treasury:reimbursements:write",
			"treasury:transactions:write",
			"inventory:write",
		],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const canReadAll = hasAnyPermission(user, [
		"treasury:receipts:read",
		"treasury:read",
		"treasury:reimbursements:write",
		"treasury:transactions:write",
		"inventory:write",
	]);

	const canWrite = hasAnyPermission(user, [
		"treasury:receipts:write",
		"treasury:receipts:update",
		"treasury:receipts:delete",
		"treasury:reimbursements:write",
		"treasury:transactions:write",
		"inventory:write",
	]);
	const canUpdate = hasAnyPermission(user, [
		"treasury:receipts:update",
		"treasury:reimbursements:write",
		"treasury:transactions:write",
		"inventory:write",
	]);
	const canDelete = hasAnyPermission(user, [
		"treasury:receipts:delete",
		"treasury:reimbursements:write",
		"treasury:transactions:write",
		"inventory:write",
	]);
	const systemLanguages = await getSystemLanguageDefaults();
	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	let allReceipts = await db.getReceipts();

	if (!canReadAll) {
		allReceipts = allReceipts.filter((r) => r.createdBy === user.userId);
	}

	let receipts = allReceipts;
	if (yearParam && yearParam !== "all") {
		receipts = receipts.filter((r) => {
			const yearMatch = r.pathname?.match(/receipts\/(\d{4})/);
			if (yearMatch) {
				return parseInt(yearMatch[1], 10) === year;
			}
			return new Date(r.createdAt).getFullYear() === year;
		});
	}

	const sortedReceipts = receipts.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const creatorIds = [
		...new Set(
			sortedReceipts
				.map((r) => r.createdBy)
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

	const receiptIds = sortedReceipts.map((r) => r.id);
	const relationsMap = await loadRelationsMapForEntities(
		db,
		"receipt",
		receiptIds,
		["reimbursement"],
	);

	const years = [
		...new Set(
			allReceipts.map((r) => {
				const yearMatch = r.pathname?.match(/receipts\/(\d{4})/);
				if (yearMatch) {
					return parseInt(yearMatch[1], 10);
				}
				return new Date(r.createdAt).getFullYear();
			}),
		),
	].sort((a, b) => b - a);

	const serializedRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of relationsMap) {
		serializedRelationsMap[id] = relations;
	}

	return {
		siteConfig: SITE_CONFIG,
		canWrite,
		canUpdate,
		canDelete,
		canReadAll,
		systemLanguages,
		receipts: sortedReceipts,
		years,
		currentYear: year,
		creatorsMap: Object.fromEntries(creatorsMap),
		relationsMap: serializedRelationsMap,
	};
}

export default function TreasuryReceipts({ loaderData }: Route.ComponentProps) {
	const {
		receipts,
		years,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
		canWrite,
		canUpdate,
		canDelete,
		canReadAll,
		relationsMap: relationsMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const relationsMap = new Map(
		Object.entries(relationsMapRaw ?? {}) as [string, RelationBadgeData[]][],
	);
	const [searchParams, setSearchParams] = useSearchParams();
	const { t, i18n } = useTranslation();

	useEffect(() => {
		const success = searchParams.get("success");
		if (success === "receipt_created") {
			toast.success(t("treasury.receipts.success.receipt_created"));
		}
		if (success) {
			setSearchParams((prev) => {
				prev.delete("success");
				return prev;
			});
		}
	}, [searchParams, setSearchParams, t]);

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);

	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options:
				years.length > 0
					? ["all", ...years.map(String)]
					: [String(new Date().getFullYear())],
		},
	];

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2 min-h-[40px]">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					title={t("treasury.receipts.new")}
					variant="icon"
					createType="receipt"
				/>
			)}
		</div>
	);

	const columns = [
		{
			key: "date",
			header: t("common.fields.date"),
			cell: (row: Receipt) => formatDate(row.createdAt),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "name",
			header: t("common.fields.name"),
			cell: (row: Receipt) => row.name || row.pathname?.split("/").pop() || "—",
			cellClassName: "font-medium",
		},
		{
			key: "description",
			header: t("common.fields.description"),
			cell: (row: Receipt) => row.description || "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: Receipt) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "relations",
			header: t("common.relations.title"),
			headerClassName: "text-center",
			cellClassName: "text-center",
			cell: (row: Receipt) => (
				<RelationsColumn relations={relationsMap.get(row.id) || []} />
			),
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.receipts.title", {
						lng: systemLanguages.primary,
					}),
					secondary: t("treasury.receipts.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={footerContent}
			>
				<div className="space-y-6">
					<ViewScopeDisclaimer canReadAll={canReadAll} itemType="receipts" />
					<TreasuryTable<Receipt>
						data={receipts}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(receipt) => (
							<TreasuryActionCell
								viewTo={`/treasury/receipts/${receipt.id}`}
								viewTitle={t("treasury.receipts.view")}
								editTo={
									canUpdate
										? `/treasury/receipts/${receipt.id}/edit`
										: undefined
								}
								editTitle={t("common.actions.edit")}
								canEdit={canUpdate}
								deleteProps={
									canDelete
										? {
												action: `/treasury/receipts/${receipt.id}/delete`,
												hiddenFields: {},
												confirmMessage: t("treasury.receipts.delete_confirm"),
												title: t("common.actions.delete"),
											}
										: undefined
								}
							/>
						)}
						emptyState={{
							title: t("treasury.receipts.no_receipts"),
						}}
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
