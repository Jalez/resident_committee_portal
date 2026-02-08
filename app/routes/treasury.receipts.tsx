import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import {
	ColoredStatusLinkBadge,
	TREASURY_PURCHASE_STATUS_VARIANTS,
} from "~/components/treasury/colored-status-link-badge";
import {
	TreasuryTable,
	TREASURY_TABLE_STYLES,
} from "~/components/treasury/treasury-table";
import { ViewScopeDisclaimer } from "~/components/treasury/view-scope-disclaimer";
import { getDatabase, type Receipt } from "~/db";
import {
	hasAnyPermission,
	requireAnyPermission,
	type RBACDatabaseAdapter,
} from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.receipts";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Kuitit / Receipts`,
		},
		{ name: "robots", content: "noindex" } as const,
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	// DatabaseAdapter implements all RBACDatabaseAdapter methods needed
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

	// Check if user can read all receipts or only their own
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

	// Fetch receipts from database
	let allReceipts = await db.getReceipts();

	// Filter receipts: if user only has read-self, show only their own receipts
	if (!canReadAll) {
		allReceipts = allReceipts.filter((r) => r.createdBy === user.userId);
	}

	// Filter by year if specified (extract year from pathname or createdAt)
	let receipts = allReceipts;
	if (yearParam && yearParam !== "all") {
		receipts = receipts.filter((r) => {
			// Try to extract year from pathname first (format: receipts/YYYY/...)
			const yearMatch = r.pathname.match(/receipts\/(\d{4})/);
			if (yearMatch) {
				return parseInt(yearMatch[1], 10) === year;
			}
			// Fallback to createdAt year
			return new Date(r.createdAt).getFullYear() === year;
		});
	}

	// Sort by date descending
	const sortedReceipts = receipts.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	// Batch resolve creator names
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

	// Fetch purchase statuses for receipts with purchaseId
	const purchaseStatusMap = new Map<string, string>();
	const purchaseIds = [
		...new Set(
			sortedReceipts
				.map((r) => r.purchaseId)
				.filter((id): id is string => Boolean(id)),
		),
	];
	for (const purchaseId of purchaseIds) {
		const purchase = await db.getPurchaseById(purchaseId);
		if (purchase) {
			purchaseStatusMap.set(purchaseId, purchase.status);
		}
	}

	// Get unique years from receipts for filter
	const years = [
		...new Set(
			allReceipts.map((r) => {
				const yearMatch = r.pathname.match(/receipts\/(\d{4})/);
				if (yearMatch) {
					return parseInt(yearMatch[1], 10);
				}
				return new Date(r.createdAt).getFullYear();
			}),
		),
	].sort((a, b) => b - a);

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
		purchaseStatusMap: Object.fromEntries(purchaseStatusMap),
	};
}

export default function TreasuryReceipts({
	loaderData,
}: Route.ComponentProps) {
	const {
		receipts,
		years,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
		canWrite,
		canUpdate,
		canDelete,
		canReadAll,
		purchaseStatusMap: purchaseStatusMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const purchaseStatusMap = new Map(
		Object.entries(purchaseStatusMapRaw ?? {}) as [string, string][],
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

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options: years.length > 0 ? ["all", ...years.map(String)] : [String(new Date().getFullYear())],
		},
	];

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2 min-h-[40px]">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					to="/treasury/receipts/new"
					title={t("treasury.receipts.new")}
					variant="icon"
				/>
			)}
		</div>
	);

	// Canonical treasury column order: Date, Name/Description, [route-specific], Created by
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
			cell: (row: Receipt) => row.name || row.pathname.split("/").pop() || "—",
			cellClassName: "font-medium",
		},
		{
			key: "description",
			header: t("common.fields.description"),
			cell: (row: Receipt) => row.description || "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "purchase",
			header: t("treasury.receipts.reimbursement_request"),
			cell: (row: Receipt) => {
				if (!row.purchaseId) {
					return <span className="text-gray-400">—</span>;
				}
				const purchaseStatus = purchaseStatusMap.get(row.purchaseId) || "pending";
				return (
					<ColoredStatusLinkBadge
						to={`/treasury/reimbursements/${row.purchaseId}`}
						title={t("treasury.receipts.reimbursement_request")}
						status={purchaseStatus}
						id={row.purchaseId}
						icon="link"
					/>
				);
			},
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: Receipt) =>
				row.createdBy ? creatorsMap.get(row.createdBy) ?? "—" : "—",
			cellClassName: "text-gray-500",
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.receipts.title", { lng: systemLanguages.primary }),
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
								editTo={canUpdate ? `/treasury/receipts/${receipt.id}/edit` : undefined}
								editTitle={t("common.actions.edit")}
								canEdit={canUpdate}
								deleteProps={
									canDelete
										? {
											action: `/api/receipts/delete`,
											hiddenFields: {
												_action: "delete",
												pathname: receipt.pathname,
											},
											confirmMessage: t(
												"treasury.receipts.delete_confirm",
											),
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
