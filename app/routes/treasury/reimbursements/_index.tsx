import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	useNavigate,
	useRouteLoaderData,
	useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { TREASURY_PURCHASE_STATUS_VARIANTS } from "~/components/colored-status-link-badge";
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
import { useReimbursementTemplate } from "~/contexts/reimbursement-template-context";
import {
	getDatabase,
	type InventoryItem,
	type Purchase,
	type PurchaseStatus,
} from "~/db/server.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
	requirePermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { createReimbursementStatusNotification } from "~/lib/notifications.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Kulukorvaukset / Reimbursements`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(
		request,
		[
			"treasury:reimbursements:read",
			"treasury:reimbursements:read-self",
			"treasury:reimbursements:write",
		],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const canReadAll = hasAnyPermission(user, ["treasury:reimbursements:read"]);

	const canCreate = hasAnyPermission(user, [
		"treasury:reimbursements:create",
		"treasury:reimbursements:create-self",
		"treasury:reimbursements:write",
	]);

	const db = getDatabase();
	const url = new URL(request.url);
	const status = url.searchParams.get("status") || "all";
	const year = url.searchParams.get("year") || String(new Date().getFullYear());

	let purchases = await db.getPurchases();

	if (!canReadAll) {
		purchases = purchases.filter((p) => p.createdBy === user.userId);
	}

	if (year !== "all") {
		purchases = purchases.filter((p) => p.year === parseInt(year, 10));
	}

	if (status !== "all") {
		purchases = purchases.filter((p) => p.status === status);
	}

	purchases.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const inventoryItems = await db.getInventoryItems();
	const itemsMap = new Map(inventoryItems.map((item) => [item.id, item]));

	const purchaseIds = purchases.map((p) => p.id);
	const relationsMap = await loadRelationsMapForEntities(
		db,
		"reimbursement",
		purchaseIds,
		["transaction", "receipt"],
	);

	const enrichedPurchases = purchases.map((p) => ({
		...p,
		inventoryItem: p.inventoryItemId ? itemsMap.get(p.inventoryItemId) : null,
	}));

	const allPurchases = await db.getPurchases();
	const years = [...new Set(allPurchases.map((p) => p.year))].sort(
		(a, b) => b - a,
	);

	const creatorIds = [
		...new Set(
			enrichedPurchases
				.map((p) => p.createdBy)
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

	const systemLanguages = await getSystemLanguageDefaults();

	const serializedRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of relationsMap) {
		serializedRelationsMap[id] = relations;
	}

	return {
		siteConfig: SITE_CONFIG,
		purchases: enrichedPurchases,
		years,
		currentYear: parseInt(year, 10) || new Date().getFullYear(),
		currentStatus: status,
		canReadAll,
		canCreate,
		systemLanguages,
		creatorsMap: Object.fromEntries(creatorsMap),
		relationsMap: serializedRelationsMap,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action");
	const reimbursementId = formData.get("reimbursementId") as string;

	if (actionType === "updateStatus" && reimbursementId) {
		await requirePermission(
			request,
			"treasury:reimbursements:update",
			getDatabase,
		);

		const newStatus = formData.get("status") as PurchaseStatus;
		await db.updatePurchase(reimbursementId, { status: newStatus });

		const purchase = await db.getPurchaseById(reimbursementId);
		if (purchase) {
			if (
				newStatus === "approved" ||
				newStatus === "rejected" ||
				newStatus === "reimbursed"
			) {
				const notificationStatus =
					newStatus === "rejected" ? "rejected" : "approved";
				await createReimbursementStatusNotification(
					purchase,
					notificationStatus,
					db,
				);
			}
		}

		const txRelationships = await db.getEntityRelationships(
			"reimbursement",
			reimbursementId,
		);
		const txRel = txRelationships.find(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		const linkedTransaction = txRel
			? await db.getTransactionById(
					txRel.relationBType === "transaction"
						? txRel.relationBId
						: txRel.relationId,
				)
			: null;
		if (linkedTransaction) {
			let newReimbursementStatus:
				| "requested"
				| "approved"
				| "declined"
				| "not_requested" = "requested";
			let newTransactionStatus: "pending" | "complete" | "paused" | "declined" =
				"pending";

			if (newStatus === "approved" || newStatus === "reimbursed") {
				newReimbursementStatus = "approved";
				newTransactionStatus = "complete";
			} else if (newStatus === "rejected") {
				newReimbursementStatus = "declined";
				newTransactionStatus = "declined";
			} else if (newStatus === "pending") {
				newReimbursementStatus = "requested";
				newTransactionStatus = "pending";
			}
			await db.updateTransaction(linkedTransaction.id, {
				reimbursementStatus: newReimbursementStatus,
				status: newTransactionStatus,
			});
		}
	}

	return { success: true };
}

export default function BudgetReimbursements({
	loaderData,
}: Route.ComponentProps) {
	const {
		purchases,
		years,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
		canReadAll,
		canCreate,
		relationsMap: relationsMapRaw,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const relationsMap = new Map(
		Object.entries(relationsMapRaw ?? {}) as [string, RelationBadgeData[]][],
	);
	const [searchParams, setSearchParams] = useSearchParams();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { setTemplate } = useReimbursementTemplate();

	useEffect(() => {
		const success = searchParams.get("success");
		if (!success) return;
		if (success === "reimbursement_requested") {
			toast.success(t("treasury.success.reimbursement_requested"));
		} else {
			toast.success(success);
		}
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("success");
		setSearchParams(nextParams, { replace: true });
	}, [searchParams, setSearchParams, t]);

	const formatCurrency = (value: number | string) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);

	const handleUseAsTemplate = (purchase: Purchase) => {
		setTemplate({
			description: purchase.description || "",
			amount: purchase.amount,
			purchaserName: purchase.purchaserName,
			bankAccount: purchase.bankAccount,
			notes: purchase.notes || undefined,
		});
		navigate("/treasury/reimbursement/new");
	};

	const statusOptions = [
		"all",
		"pending",
		"approved",
		"reimbursed",
		"rejected",
	];
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
			placeholder: t("common.actions.all"),
			options: statusOptions,
		},
	];

	const footerContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
			{canCreate && (
				<AddItemButton
					title={t("treasury.reimbursements.new")}
					variant="icon"
					createType="reimbursement"
				/>
			)}
		</div>
	);

	type PurchaseRow = Purchase & {
		inventoryItem?: InventoryItem | null;
	};

	const columns = [
		{
			key: "date",
			header: t("common.fields.date"),
			cell: (row: PurchaseRow) => formatDate(row.createdAt),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "description",
			header: t("common.fields.description"),
			cell: (row: PurchaseRow) =>
				row.inventoryItem?.name || row.description || "—",
			cellClassName: "font-medium max-w-[200px] truncate",
		},
		{
			key: "purchaser",
			header: t("treasury.reimbursements.purchaser"),
			cell: (row: PurchaseRow) => row.purchaserName,
		},
		{
			key: "status",
			header: t("common.fields.status"),
			cell: (row: PurchaseRow) => {
				const canApprove =
					rootData?.user?.permissions?.includes(
						"treasury:reimbursements:update",
					) || rootData?.user?.permissions?.includes("*");
				const statusKey =
					row.status as keyof typeof TREASURY_PURCHASE_STATUS_VARIANTS;
				const statusColor =
					TREASURY_PURCHASE_STATUS_VARIANTS[statusKey] ||
					TREASURY_PURCHASE_STATUS_VARIANTS.pending;
				if (canApprove) {
					return (
						<Form method="post" className="inline-block">
							<input type="hidden" name="_action" value="updateStatus" />
							<input type="hidden" name="reimbursementId" value={row.id} />
							<select
								name="status"
								defaultValue={row.status}
								onChange={(e) => e.target.form?.requestSubmit()}
								className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 ${statusColor}`}
							>
								<option value="pending">
									{t("treasury.reimbursements.statuses.pending")}
								</option>
								<option value="approved">
									{t("treasury.reimbursements.statuses.approved")}
								</option>
								<option value="reimbursed">
									{t("treasury.reimbursements.statuses.reimbursed")}
								</option>
								<option value="rejected">
									{t("treasury.reimbursements.statuses.rejected")}
								</option>
							</select>
						</Form>
					);
				}
				return (
					<TreasuryStatusPill
						value={row.status}
						variantMap={TREASURY_PURCHASE_STATUS_VARIANTS}
						label={t(`treasury.reimbursements.statuses.${row.status}`)}
					/>
				);
			},
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: PurchaseRow) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "relations",
			header: t("common.relations.title"),
			headerClassName: "text-center",
			cellClassName: "text-center",
			cell: (row: PurchaseRow) => (
				<RelationsColumn relations={relationsMap.get(row.id) || []} />
			),
		},
		{
			key: "amount",
			header: t("common.fields.amount"),
			headerClassName: "text-right",
			align: "right" as const,
			cell: (row: PurchaseRow) => formatCurrency(row.amount),
			cellClassName: TREASURY_TABLE_STYLES.AMOUNT_CELL,
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.reimbursements.title", {
						lng: systemLanguages.primary,
					}),
					secondary: t("treasury.reimbursements.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={footerContent}
			>
				<div className="space-y-6">
					<ViewScopeDisclaimer
						canReadAll={canReadAll}
						itemType="reimbursements"
					/>
					<TreasuryTable<PurchaseRow>
						data={purchases}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(purchase) => {
							const canDeleteGeneral =
								rootData?.user?.permissions?.includes(
									"treasury:reimbursements:delete",
								) || rootData?.user?.permissions?.includes("*");
							const canDeleteSelf =
								rootData?.user?.permissions?.includes(
									"treasury:reimbursements:delete-self",
								) &&
								purchase.createdBy &&
								rootData?.user?.userId === purchase.createdBy;
							const canDelete = canDeleteGeneral || canDeleteSelf;
							const canUpdateGeneral =
								rootData?.user?.permissions?.includes(
									"treasury:reimbursements:update",
								) || rootData?.user?.permissions?.includes("*");
							const canUpdateSelf =
								rootData?.user?.permissions?.includes(
									"treasury:reimbursements:update-self",
								) &&
								purchase.createdBy &&
								rootData?.user?.userId === purchase.createdBy;
							const canUpdate = canUpdateGeneral || canUpdateSelf;

							return (
								<TreasuryActionCell
									viewTo={`/treasury/reimbursements/${purchase.id}`}
									viewTitle={t("common.actions.view")}
									editTo={`/treasury/reimbursements/${purchase.id}/edit`}
									editTitle={t("common.actions.edit")}
									canEdit={Boolean(canUpdate)}
									copyProps={{
										onClick: () => handleUseAsTemplate(purchase),
										title: t("treasury.reimbursements.use_as_template"),
									}}
									deleteProps={
										canDelete
											? {
													action: `/treasury/reimbursements/${purchase.id}/delete`,
													hiddenFields: {},
													confirmMessage: t(
														"treasury.reimbursements.delete_confirm",
													),
													title: t("common.actions.delete"),
												}
											: undefined
									}
								/>
							);
						}}
						emptyState={{
							title: t("treasury.no_transactions"),
						}}
						totals={{
							labelColSpan: 7,
							columns: [
								{
									value: purchases.reduce(
										(sum, p) => sum + parseFloat(p.amount),
										0,
									),
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
