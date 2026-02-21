import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActionData, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { saveReceiptOCRContent } from "~/actions/receipt-actions.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { ReceiptFormFields } from "~/components/treasury/receipt-form-fields";
import { EditForm } from "~/components/ui/edit-form";
import { useFileUpload } from "~/hooks/use-file-upload";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import {
	deleteOldFile,
	extractYearFromPath,
	handleFileUpload,
} from "~/lib/file-upload.server";
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
			const extractedYear = extractYearFromPath(entity.pathname);

			const uploadResult = await handleFileUpload({
				formData,
				entityType: "receipt",
				entity: {
					id: entity.id,
					fileUrl: entity.url,
					fileKey: entity.pathname,
				},
				name: name,
				year: extractedYear,
			});

			if ("error" in uploadResult) {
				return uploadResult;
			}

			if (uploadResult.pathname && uploadResult.pathname !== entity.pathname) {
				await deleteOldFile("receipt", entity.pathname);
			}

			await db.updateReceipt(id, {
				name: uploadResult.name || name,
				description: data.description?.trim() || null,
				url: uploadResult.url || entity.url,
				pathname: uploadResult.pathname || entity.pathname,
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
	const { receipt, relationships, returnUrl, sourceContext } =
		loaderData as any;
	const { t } = useTranslation();
	const navigate = useNavigate();

	const [name, setName] = useState(receipt.name || "");
	const [description, setDescription] = useState(receipt.description || "");
	const [analyzeWithAI, setAnalyzeWithAI] = useState(true);

	useEffect(() => {
		if (actionData && typeof actionData === "object" && "error" in actionData) {
			toast.error(actionData.error as string);
		}
	}, [actionData]);

	const year =
		receipt.pathname?.split("/")[1] || new Date().getFullYear().toString();

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
	} = useFileUpload({
		entityType: "receipt",
		entityId: receipt.id,
		year,
		enableAI: analyzeWithAI,
		onNameSuggestion: (val) => setName((prev: string) => prev || val),
		onDescriptionSuggestion: (val) => setDescription((prev: string) => prev || val),
	});

	useEffect(() => {
		if (actionData?.success) {
			clearDraft();
		}
	}, [actionData, clearDraft]);

	const currentFileName = receipt.pathname?.split("/").pop() || "receipt";
	const displayReceiptUrl = tempUrl || receipt.url || undefined;
	const displayFileName =
		tempPathname?.split("/").pop() || currentFileName;

	return (
		<PageWrapper>
			<EditForm
				title={t("treasury.receipts.edit")}
				action=""
				encType="multipart/form-data"
				inputFields={{
					name: null,
					description: null,
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
					ocr_data: ocrData
						? JSON.stringify({
							rawText: ocrData.rawText,
							parsedData: ocrData.parsedData,
						})
						: undefined,
				}}
				translationNamespace="treasury.receipts"
				onFieldChange={(fieldName, value) => {
					if (fieldName === "name") {
						setName(String(value || ""));
					}
					if (fieldName === "description") {
						setDescription(String(value || ""));
					}
				}}
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
					existingReceiptUrl={displayReceiptUrl}
					existingFileName={displayFileName}
					existingReceipt={receipt}
				/>
			</EditForm>
		</PageWrapper>
	);
}
