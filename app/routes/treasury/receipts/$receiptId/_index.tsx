import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ReceiptContentsDisplay } from "~/components/treasury/receipt-contents-display";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { Button } from "~/components/ui/button";
import { ViewForm } from "~/components/ui/view-form";
import { encodeRelationshipContext } from "~/lib/linking/relationship-context";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const receiptName =
		(data as any)?.receipt?.name ||
		(data as any)?.receipt?.pathname?.split("/").pop() ||
		"Receipt";
	const title = `${receiptName.substring(0, 30)} / View Receipt`;
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createViewLoader({
		entityType: "receipt",
		permission: "treasury:receipts:read",
		permissionSelf: "treasury:receipts:read-self",
		params,
		request,
		fetchEntity: (db, id) => db.getReceiptById(id),
		extend: async ({ db, entity: receipt }) => {
			const creator = receipt.createdBy
				? await db.findUserById(receipt.createdBy)
				: null;
			const receiptContent = await db.getReceiptContentByReceiptId(receipt.id);
			let createdInventoryItems: any[] = [];
			if (receiptContent?.inventoryItemIds) {
				try {
					const itemIds = JSON.parse(receiptContent.inventoryItemIds);
					createdInventoryItems = await Promise.all(
						itemIds.map((id: string) => db.getInventoryItemById(id)),
					);
					createdInventoryItems = createdInventoryItems.filter(Boolean);
				} catch (error) {
					console.error("Error parsing inventory item IDs:", error);
				}
			}
			return {
				creatorName: creator?.name || null,
				receiptContent,
				createdInventoryItems,
			};
		},
	});
}

export default function ViewReceipt({ loaderData }: Route.ComponentProps) {
	const {
		receipt,
		relationships,
		creatorName,
		receiptContent,
		createdInventoryItems,
	} = loaderData as any;
	const hasLinkedReimbursement =
		(relationships.reimbursement?.linked.length || 0) > 0;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();

	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:receipts:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("treasury:receipts:update-self") &&
		receipt.createdBy &&
		rootData?.user?.userId === receipt.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	const pathnameParts = receipt.pathname?.split("/") || [];
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	const displayFields = {
		name: receipt.name || receipt.pathname?.split("/").pop() || "—",
		description: { value: receipt.description, hide: !receipt.description },
		url: {
			value: receipt.url,
			type: "url",
			hide: !receipt.url,
		},
		createdBy: { value: creatorName, hide: !creatorName },
	};

	const inventoryRelations = createdInventoryItems.map((item: any) => ({
		to: `/inventory/${item.id}`,
		title: item.name,
		status: item.needsCompletion ? "incomplete" : "complete",
		id: item.id,
		description:
			item.location || t("inventory.location_missing", "Location needed"),
		variantMap: {
			incomplete:
				"bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
			complete:
				"bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
		},
	}));

	return (
		<PageWrapper>
			<ViewForm
				title={t("treasury.receipts.view.title", "View Receipt")}
				entityType="receipt"
				entityId={receipt.id}
				entityName={receipt.name || ""}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl={`/treasury/receipts?year=${year}`}
				canEdit={canUpdate}
				canDelete={canUpdate}
				translationNamespace="treasury.receipts"
			>
				{receipt.url && (
					<ReceiptContentsDisplay
						receiptId={receipt.id}
						receiptUrl={receipt.url}
						content={receiptContent}
					/>
				)}

				{inventoryRelations.length > 0 && (
					<TreasuryDetailCard
						title={t("inventory.created_items", "Created Inventory Items")}
					>
						<div className="space-y-2">
							{inventoryRelations.map((item: any) => (
								<Link
									key={item.id}
									to={item.to}
									className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
								>
									<div className="flex flex-col">
										<span className="font-medium">{item.title}</span>
										<span className="text-sm text-muted-foreground">
											{item.description}
										</span>
									</div>
									<span
										className={`px-2 py-1 text-xs rounded-full ${item.variantMap[item.status as keyof typeof item.variantMap]}`}
									>
										{item.status === "complete"
											? t("common.status.complete")
											: t("common.status.incomplete")}
									</span>
								</Link>
							))}
						</div>
					</TreasuryDetailCard>
				)}

				{receiptContent && !hasLinkedReimbursement && (
					<Link
						to={`/treasury/reimbursements/new?source=${encodeRelationshipContext(
							{
								type: "receipt",
								id: receipt.id,
								name:
									receipt.name ||
									receipt.pathname?.split("/").pop() ||
									"Receipt",
							},
						)}`}
					>
						<Button variant="default">
							<span className="material-symbols-outlined mr-2">add</span>
							{t(
								"treasury.receipts.create_reimbursement",
								"Create Reimbursement",
							)}
						</Button>
					</Link>
				)}
			</ViewForm>
		</PageWrapper>
	);
}
