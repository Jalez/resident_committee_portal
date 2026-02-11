import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useNavigate } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { ReceiptFormFields } from "~/components/treasury/receipt-form-fields";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { getDatabase } from "~/db";
import { useReceiptUpload } from "~/hooks/use-receipt-upload";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Muokkaa kuittia / Edit Receipt`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();
	const receipt = await db.getReceiptById(params.receiptId);

	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	await requirePermissionOrSelf(
		request,
		"treasury:receipts:update",
		"treasury:receipts:update-self",
		receipt.createdBy,
		getDatabase,
	);

	// Load relationships using new universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"receipt",
		receipt.id,
		["reimbursement", "transaction", "inventory"],
	);

	// Get relationship context from URL for auto-linking
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	return {
		siteConfig: SITE_CONFIG,
		receipt,
		receiptContent: await db.getReceiptContentByReceiptId(receipt.id),
		relationshipContext: await getRelationshipContext(
			db,
			"receipt",
			receipt.id,
			undefined,
		),
		relationships,
		sourceContext,
		returnUrl,
	};
}

export async function action() {
	// Receipt update logic has been moved to /api/receipts/:receiptId/update
	return null;
}

export default function TreasuryReceiptsEdit({
	loaderData,
}: Route.ComponentProps) {
	const actionData = useActionData<any>();
	const { receipt, receiptContent, relationships } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();

	const allowedTypes =
		actionData && typeof actionData === "object" && "allowedTypes" in actionData
			? (actionData.allowedTypes as string)
			: "";

	const [name, setName] = useState(receipt.name || "");
	const [description, setDescription] = useState(receipt.description || "");
	const [analyzeWithAI, setAnalyzeWithAI] = useState(true);

	// Use relationship picker hook
	const relationshipPicker = useRelationshipPicker({
		relationAType: "receipt",
		relationAId: receipt.id,
		initialRelationships: [],
	});

	const {
		isUploading,
		isAnalyzing,
		selectedFile,
		ocrData,
		tempUrl,
		tempPathname,
		handleFileChange,
		handleReanalyze,
		handleCancel,
		clearDraft,
	} = useReceiptUpload({
		receiptId: receipt.id,
		analyzeWithAI,
	});

	const currentFileName = receipt.pathname?.split("/").pop() || "receipt";

	// Clear draft on successful submission
	const handleSubmit = () => {
		clearDraft();
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.receipts.edit")} />

				{actionData &&
					typeof actionData === "object" &&
					"error" in actionData && (
						<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
							{actionData.error === "invalid_file_type"
								? t("treasury.receipts.invalid_file_type", {
										types: allowedTypes,
									})
								: (actionData.error as string)}
						</div>
					)}
				<TreasuryDetailCard
					title={t("treasury.receipts.link_to_reimbursement")}
				>
					<Form
						method="post"
						action={`/api/receipts/${receipt.id}/update`}
						encType="multipart/form-data"
						className="space-y-6"
						onSubmit={handleSubmit}
					>
						{/* Hidden fields for auto-linking */}
						{loaderData.sourceContext && (
							<>
								<input
									type="hidden"
									name="sourceType"
									value={loaderData.sourceContext.type}
								/>
								<input
									type="hidden"
									name="sourceId"
									value={loaderData.sourceContext.id}
								/>
							</>
						)}
						{loaderData.returnUrl && (
							<input
								type="hidden"
								name="_returnUrl"
								value={loaderData.returnUrl}
							/>
						)}

						{tempUrl && <input type="hidden" name="tempUrl" value={tempUrl} />}
						{tempPathname && (
							<input type="hidden" name="tempPathname" value={tempPathname} />
						)}
						{ocrData && (
							<input
								type="hidden"
								name="ocr_data"
								value={JSON.stringify({
									rawText: ocrData.rawText,
									parsedData: ocrData.parsedData,
								})}
							/>
						)}

						<ReceiptFormFields
							receiptId={receipt.id}
							analyzeWithAI={analyzeWithAI}
							onAnalyzeChange={setAnalyzeWithAI}
							onFileChange={handleFileChange}
							isUploading={isUploading}
							isAnalyzing={isAnalyzing}
							name={name}
							onNameChange={setName}
							description={description || ""}
							onDescriptionChange={setDescription}
							ocrData={ocrData}
							tempUrl={tempUrl}
							onReanalyze={handleReanalyze}
							selectedFile={selectedFile}
							existingReceiptUrl={receipt.url || undefined}
							existingFileName={currentFileName}
							existingReceiptContent={receiptContent}
						/>

						<RelationshipPicker
							relationAType="receipt"
							relationAId={receipt.id}
							relationAName={receipt.name || "Receipt"}
							sections={[
								{
									relationBType: "reimbursement",
									linkedEntities: (relationships.reimbursement?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.reimbursement?.available ||
										[]) as unknown as AnyEntity[],
									maxItems: 1,
									createType: "reimbursement",
								},
								{
									relationBType: "transaction",
									linkedEntities: (relationships.transaction?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.transaction?.available ||
										[]) as unknown as AnyEntity[],
									createType: "transaction",
								},
								{
									relationBType: "inventory",
									linkedEntities: (relationships.inventory?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.inventory?.available ||
										[]) as unknown as AnyEntity[],
									createType: "inventory",
								},
							]}
							mode="edit"
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							storageKeyPrefix={`receipt-${receipt.id}`}
							formData={relationshipPicker.toFormData()}
						/>

						<TreasuryFormActions
							disabled={isAnalyzing || isUploading}
							onCancel={() => {
								handleCancel();
								navigate(loaderData.returnUrl || "/treasury/receipts");
							}}
						/>
					</Form>
				</TreasuryDetailCard>
			</div>
		</PageWrapper>
	);
}
