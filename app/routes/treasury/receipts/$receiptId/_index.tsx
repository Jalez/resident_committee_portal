import { useTranslation } from "react-i18next";
import { Form, Link, useRouteLoaderData } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { ReceiptContentsDisplay } from "~/components/treasury/receipt-contents-display";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { encodeRelationshipContext } from "~/lib/linking/relationship-context";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const receiptName =
		data?.receipt?.name ||
		data?.receipt?.pathname?.split("/").pop() ||
		"Receipt";
	const title = `${receiptName.substring(0, 30)} / View Receipt`;
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const receipt = await db.getReceiptById(params.receiptId);

	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-read support
	await requirePermissionOrSelf(
		request,
		"treasury:receipts:read",
		"treasury:receipts:read-self",
		receipt.createdBy,
		getDatabase,
	);

	// Load relationships using universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"receipt",
		receipt.id,
		["reimbursement"],
	);

	// Get creator name
	const creator = receipt.createdBy
		? await db.findUserById(receipt.createdBy)
		: null;

	// Get OCR content
	const receiptContent = await db.getReceiptContentByReceiptId(receipt.id);

	// Get created inventory items if processed
	let createdInventoryItems = [];
	if (receiptContent?.inventoryItemIds) {
		try {
			const itemIds = JSON.parse(receiptContent.inventoryItemIds);
			createdInventoryItems = await Promise.all(
				itemIds.map((id: string) => db.getInventoryItemById(id)),
			);
			// Filter out any null results
			createdInventoryItems = createdInventoryItems.filter(Boolean);
		} catch (error) {
			console.error("Error parsing inventory item IDs:", error);
		}
	}

	return {
		siteConfig: SITE_CONFIG,
		receipt,
		relationships,
		creatorName: creator?.name || null,
		receiptContent,
		createdInventoryItems,
	};
}

export default function ViewReceipt({ loaderData }: Route.ComponentProps) {
	const {
		receipt,
		relationships,
		creatorName,
		receiptContent,
		createdInventoryItems,
	} = loaderData;
	const hasLinkedReimbursement =
		(relationships.reimbursement?.linked.length || 0) > 0;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();

	// Check if user can edit
	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:receipts:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("treasury:receipts:update-self") &&
		receipt.createdBy &&
		rootData?.user?.userId === receipt.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	// Check if user can process receipts
	const canProcessGeneral =
		rootData?.user?.permissions?.includes("treasury:receipts:process") ||
		rootData?.user?.permissions?.includes("*");
	const canProcessSelf =
		receipt.createdBy && rootData?.user?.userId === receipt.createdBy;
	const canProcess = canProcessGeneral || canProcessSelf;

	// Extract year from pathname for navigation
	const pathnameParts = receipt.pathname?.split("/") || [];
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	// Prepare inventory items for relation list
	const inventoryRelations = createdInventoryItems.map((item) => ({
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
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader
						title={t("treasury.receipts.view.title", "View Receipt")}
					/>
					<div className="flex gap-2">
						{canProcess && receiptContent && !receiptContent.processed && (
							<Form
								method="post"
								action={`/api/receipts/${receipt.id}/process`}
							>
								<Button type="submit" variant="default">
									<span className="material-symbols-outlined mr-2">
										auto_fix_high
									</span>
									{t("treasury.receipts.process_receipt", "Process Receipt")}
								</Button>
							</Form>
						)}
						{receiptContent?.processed && (
							<div className="flex items-center gap-1.5 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-md dark:bg-green-900/30 dark:text-green-300">
								<span className="material-symbols-outlined text-base">
									check_circle
								</span>
								{t("treasury.receipts.processed", "Processed")}
							</div>
						)}
						{canUpdate && (
							<Link to={`/treasury/receipts/${receipt.id}/edit`}>
								<Button variant="default">
									<span className="material-symbols-outlined mr-2">edit</span>
									{t("common.actions.edit")}
								</Button>
							</Link>
						)}
					</div>
				</div>

				<div className="space-y-6">
					<TreasuryDetailCard
						title={t("treasury.receipts.details", "Receipt Details")}
					>
						<div className="grid gap-4">
							<TreasuryField label={t("common.fields.name")}>
								{receipt.name || receipt.pathname?.split("/").pop() || "—"}
							</TreasuryField>
							{receipt.description ? (
								<TreasuryField label={t("common.fields.description")}>
									{receipt.description}
								</TreasuryField>
							) : null}
							{receipt.url ? (
								<TreasuryField
									label={t("treasury.receipts.receipt_file", "Receipt File")}
									valueClassName="text-foreground"
								>
									<Button asChild variant="outline" size="sm">
										<a
											href={receipt.url}
											target="_blank"
											rel="noopener noreferrer"
										>
											<span className="material-symbols-outlined text-base">
												open_in_new
											</span>
											{t("treasury.receipts.open_receipt", "Open Receipt")}
										</a>
									</Button>
								</TreasuryField>
							) : null}
							{creatorName ? (
								<TreasuryField label={t("common.fields.created_by")}>
									{creatorName}
								</TreasuryField>
							) : null}
						</div>

						<RelationshipPicker
							relationAType="receipt"
							relationAId={receipt.id}
							relationAName={receipt.name || ""}
							mode="view"
							sections={[
								{
									relationBType: "reimbursement",
									linkedEntities: (relationships.reimbursement?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: [],
								},
							]}
						/>
					</TreasuryDetailCard>

					{/* OCR Content Display */}
					{receipt.url && (
						<ReceiptContentsDisplay
							receiptId={receipt.id}
							receiptUrl={receipt.url}
							content={receiptContent}
						/>
					)}

					{/* Created Inventory Items */}
					{inventoryRelations.length > 0 && (
						<TreasuryDetailCard
							title={t("inventory.created_items", "Created Inventory Items")}
						>
							<div className="space-y-2">
								{inventoryRelations.map((item) => (
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

					{/* Actions */}
					<div className="flex gap-3">
						<Link to={`/treasury/receipts?year=${year}`}>
							<Button variant="outline">
								<span className="material-symbols-outlined mr-2">
									arrow_back
								</span>
								{t("common.actions.back_to_list", "Back to Receipts")}
							</Button>
						</Link>
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
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
