import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useActionData, useNavigate } from "react-router";
import { z } from "zod";
import {
	handleFileUpload,
	saveReceiptOCRContent,
} from "~/actions/receipt-actions.server";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm } from "~/components/ui/edit-form";
import { ReceiptFormFields } from "~/components/treasury/receipt-form-fields";
import { useReceiptUpload } from "~/hooks/use-receipt-upload";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - Muokkaa kuittia / Edit Receipt`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "receipt",
		permission: "treasury:receipts:update",
		permissionSelf: "treasury:receipts:update-self",
		params,
		request,
		fetchEntity: (db, id) => db.getReceiptById(id),
		relationshipTypes: ["reimbursement", "transaction", "inventory"],
		extend: async ({ db, entity }) => ({
			receiptContent: await db.getReceiptContentByReceiptId(entity.id),
		}),
	});
}

const updateReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "receipt",
		permission: "treasury:receipts:update",
		permissionSelf: "treasury:receipts:update-self",
		params,
		request,
		schema: updateReceiptSchema,
		fetchEntity: (db, id) => db.getReceiptById(id),
		onUpdate: async ({ db, id, data, entity, formData, newStatus }) => {
			const name = data.name || "";
			const uploadResult = await handleFileUpload(formData, entity as any, name);
			if ("error" in uploadResult) {
				return uploadResult;
			}

			const { nextUrl, nextPathname, nextName } = uploadResult;
			await db.updateReceipt(id, {
				name: nextName,
				description: data.description?.trim() || null,
				url: nextUrl,
				pathname: nextPathname,
				status: (newStatus as any) || (entity as any).status,
			});
		},
		afterUpdate: async ({ entity, formData }) => {
			await saveReceiptOCRContent(formData, entity as any);
		},
	});
}

export default function TreasuryReceiptsEdit({
	loaderData,
}: Route.ComponentProps) {
	const actionData = useActionData<any>();
	const { receipt, receiptContent, relationships, returnUrl, sourceContext } = loaderData as any;
	const { t } = useTranslation();
	const navigate = useNavigate();

	const allowedTypes =
		actionData && typeof actionData === "object" && "allowedTypes" in actionData
			? (actionData.allowedTypes as string)
			: "";

	const [name, setName] = useState(receipt.name || "");
	const [description, setDescription] = useState(receipt.description || "");
	const [analyzeWithAI, setAnalyzeWithAI] = useState(true);

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

	// Clear draft on successful submission is implicit if we navigate away, 
	// but EditForm submits and redirects.
	// If we want to clear draft explicitly, we might need to hook into form submission or unmount.

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				{/* Error display */}
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

				<EditForm
					title={t("treasury.receipts.edit")}
					action=""
					encType="multipart/form-data"
					inputFields={{
						name: null,
						description: null
					}}
					entityType="receipt"
					entityId={receipt.id}
					relationships={relationships}
					returnUrl={returnUrl || "/treasury/receipts"}
					onCancel={() => {
						handleCancel();
						if (window.history.length > 1) {
							navigate(-1);
						} else {
							navigate("/treasury/receipts");
						}
					}}
					deleteUrl={ENTITY_REGISTRY.receipt.deleteUrl(receipt.id)}
					submitDisabled={isAnalyzing || isUploading}
					hiddenFields={{
						_sourceType: sourceContext?.type,
						_sourceId: sourceContext?.id,
						_returnUrl: returnUrl,
						tempUrl: tempUrl,
						tempPathname: tempPathname,
						ocr_data: ocrData ? JSON.stringify({
							rawText: ocrData.rawText,
							parsedData: ocrData.parsedData,
						}) : undefined,
					}}
					translationNamespace="treasury.receipts"
				>
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
				</EditForm>
			</div>
		</PageWrapper>
	);
}
