import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";
import {
	TreasuryDetailCard,
	TreasuryField,
	TreasuryRelationList,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/inventory.$itemId";

const INVENTORY_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	removed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	legacy: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export function meta({ data }: Route.MetaArgs) {
	const name = data?.item?.name || "Item";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${name}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "inventory:read", getDatabase);
	const db = getDatabase();

	const item = await db.getInventoryItemById(params.itemId);
	if (!item) {
		throw new Response("Not Found", { status: 404 });
	}

	// Get linked transactions via entity relationships
	const relationships = await db.getEntityRelationships("inventory", item.id);
	const transactionLinks: { transaction: { id: string; description: string; status: string; type: string }; quantity: number }[] = [];
	
	for (const rel of relationships) {
		if (rel.relationBType === "transaction" || rel.relationAType === "transaction") {
			const transactionId = rel.relationBType === "transaction" ? rel.relationBId : rel.relationId;
			const transaction = await db.getTransactionById(transactionId);
			if (transaction) {
				transactionLinks.push({
					transaction: {
						id: transaction.id,
						description: transaction.description,
						status: transaction.status,
						type: transaction.type,
					},
					quantity: 1,
				});
			}
		}
	}

	return {
		siteConfig: SITE_CONFIG,
		item,
		transactionLinks,
	};
}

export default function ViewInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { item, transactionLinks } = loaderData;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t, i18n } = useTranslation();

	const canWrite =
		rootData?.user?.permissions?.includes("inventory:write") ||
		rootData?.user?.permissions?.includes("*");

	const formatCurrency = (value: string | number) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string | null) => {
		if (!date) return "—";
		return new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);
	};

	const transactionRelations = transactionLinks.map(
		({ transaction, quantity }) => ({
			to: `/treasury/transactions/${transaction.id}`,
			title: `${transaction.description} (${quantity}x)`,
			status: transaction.status,
			id: transaction.id,
			variantMap: TREASURY_TRANSACTION_STATUS_VARIANTS,
		}),
	);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader
						title={t("inventory.view.title", "View Item")}
					/>
					{canWrite && (
						<Link to={`/inventory/${item.id}/edit`}>
							<Button variant="default">
								<span className="material-symbols-outlined mr-2">
									edit
								</span>
								{t("common.actions.edit")}
							</Button>
						</Link>
					)}
				</div>

				<div className="space-y-6">
					<TreasuryDetailCard
						title={t("inventory.details", "Item Details")}
					>
						<div className="grid gap-4">
							<TreasuryField
								label={t("common.fields.name")}
								valueClassName="text-foreground font-semibold"
							>
								{item.name}
							</TreasuryField>
							<TreasuryField label={t("common.fields.quantity")}>
								{item.quantity}
							</TreasuryField>
							<TreasuryField label={t("common.fields.location")}>
								{item.location || "—"}
							</TreasuryField>
							{item.category ? (
								<TreasuryField
									label={t("common.fields.category")}
								>
									{item.category}
								</TreasuryField>
							) : null}
							{item.description ? (
								<TreasuryField
									label={t("common.fields.description")}
								>
									{item.description}
								</TreasuryField>
							) : null}
							<TreasuryField
								label={t("common.fields.value")}
								valueClassName="text-foreground font-bold"
							>
								{formatCurrency(item.value || "0")}
							</TreasuryField>
							<TreasuryField
								label={t("common.fields.status")}
								valueClassName="text-foreground"
							>
								<TreasuryStatusPill
									value={item.status}
									variantMap={INVENTORY_STATUS_VARIANTS}
									label={t(
										`inventory.statuses.${item.status}`,
										item.status,
									)}
								/>
							</TreasuryField>
							{item.purchasedAt ? (
								<TreasuryField
									label={t(
										"inventory.form.purchased_at_label",
										"Purchased At",
									)}
								>
									{formatDate(item.purchasedAt)}
								</TreasuryField>
							) : null}
							<TreasuryField
								label={t(
									"inventory.form.show_in_info_reel",
									"Show in Info Reel",
								)}
							>
								<Badge variant="secondary">
									{item.showInInfoReel
										? t("common.yes", "Yes")
										: t("common.no", "No")}
								</Badge>
							</TreasuryField>
						</div>

						<TreasuryRelationList
							label={t(
								"inventory.linked_transactions",
								"Linked Transactions",
							)}
							items={transactionRelations}
							withSeparator
						/>
					</TreasuryDetailCard>

					<div className="flex gap-3">
						<Link to="/inventory">
							<Button variant="outline">
								<span className="material-symbols-outlined mr-2">
									arrow_back
								</span>
								{t(
									"common.actions.back_to_list",
									"Back to Inventory",
								)}
							</Button>
						</Link>
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
