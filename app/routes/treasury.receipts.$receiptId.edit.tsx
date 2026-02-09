import { useState } from "react";
import { Form, redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { ReceiptFormFields } from "~/components/treasury/receipt-form-fields";
import { useReceiptUpload } from "~/hooks/use-receipt-upload";
import { getDatabase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import {
	validateReceiptUpdate,
	handleFileUpload,
	updateReceiptInDB,
	saveReceiptOCRContent,
} from "~/actions/receipt-actions";
import { type AnyEntity } from "~/lib/entity-converters";
import type { Route } from "./+types/treasury.receipts.$receiptId.edit";

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

	return {
		siteConfig: SITE_CONFIG,
		receipt,
		receiptContent: await db.getReceiptContentByReceiptId(receipt.id),
		relationshipContext: await getRelationshipContext(db, "receipt", receipt.id, undefined),
		relationships,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();
	const receipt = await db.getReceiptById(params.receiptId);

	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	const user = await requirePermissionOrSelf(
		request,
		"treasury:receipts:update",
		"treasury:receipts:update-self",
		receipt.createdBy,
		getDatabase,
	);

	const formData = await request.formData();

	// Validate form data
	const validationResult = await validateReceiptUpdate(formData);
	if (!validationResult.success) {
		return {
			error: "Validation failed",
			fieldErrors: validationResult.error.flatten().fieldErrors,
		};
	}

	const name = (formData.get("name") as string | null) || "";
	const description = formData.get("description") as string | null;

	// Handle file upload
	const uploadResult = await handleFileUpload(formData, receipt, name);
	if ("error" in uploadResult) {
		return uploadResult;
	}

	const { nextUrl, nextPathname, nextName } = uploadResult;

	// Update receipt in DB
	await updateReceiptInDB(
		receipt.id,
		nextName,
		description?.trim() || null,
		nextUrl,
		nextPathname,
	);

	// Save relationships
	await saveRelationshipChanges(db, "receipt", receipt.id, formData, user?.userId || null);

	// Save OCR content
	await saveReceiptOCRContent(formData, receipt);

	const pathnameParts = receipt.pathname?.split("/") || [];
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	return redirect(`/treasury/receipts?year=${year}&success=receipt_updated`);
}

export default function TreasuryReceiptsEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { receipt, receiptContent, relationships } = loaderData;
	const { t } = useTranslation();

	const allowedTypes =
		actionData &&
		typeof actionData === "object" &&
		"allowedTypes" in actionData
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

				{actionData && typeof actionData === "object" && "error" in actionData && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
						{actionData.error === "invalid_file_type"
							? t("treasury.receipts.invalid_file_type", {
									types: allowedTypes,
							})
							: (actionData.error as string)}
					</div>
				)}

				<Form method="post" encType="multipart/form-data" className="space-y-6" onSubmit={handleSubmit}>
					{tempUrl && <input type="hidden" name="tempUrl" value={tempUrl} />}
					{tempPathname && <input type="hidden" name="tempPathname" value={tempPathname} />}
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

					<TreasuryDetailCard title={t("treasury.receipts.link_to_reimbursement")}>
						<RelationshipPicker
							relationAType="receipt"
							relationAId={receipt.id}
							relationAName={receipt.name || "Receipt"}
							sections={[
								{
									relationBType: "reimbursement",
									linkedEntities: ((relationships.reimbursement?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.reimbursement?.available || []) as unknown) as AnyEntity[],
									maxItems: 1,
									createType: "reimbursement",
								},
								{
									relationBType: "transaction",
									linkedEntities: ((relationships.transaction?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.transaction?.available || []) as unknown) as AnyEntity[],
									createType: "transaction",
								},
								{
									relationBType: "inventory",
									linkedEntities: ((relationships.inventory?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.inventory?.available || []) as unknown) as AnyEntity[],
									createType: "inventory",
								},
							]}
							mode="edit"
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							showAnalyzeButton={true}
							storageKeyPrefix={`receipt-${receipt.id}`}
							formData={relationshipPicker.toFormData()}
						/>
					</TreasuryDetailCard>

					<TreasuryFormActions
						disabled={isAnalyzing || isUploading}
						onCancel={handleCancel}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
