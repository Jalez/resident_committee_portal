import { useState } from "react";
import { Form, redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { ReimbursementsPicker } from "~/components/treasury/pickers/reimbursements-picker";
import { ReceiptFormFields } from "~/components/treasury/receipt-form-fields";
import { useReceiptUpload } from "~/hooks/use-receipt-upload";
import { getDatabase, type NewReceiptContent } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_ALLOWED_MIME_TYPES, RECEIPT_ALLOWED_TYPES } from "~/lib/constants";
import { getReceiptStorage } from "~/lib/receipts";
import { buildReceiptPath } from "~/lib/receipts/utils";
import type { Route } from "./+types/treasury.receipts.$receiptId.edit";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Muokkaa kuittia / Edit Receipt`,
		},
		{ name: "robots", content: "noindex" },
	];
}

const updateReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	purchaseId: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.or(z.literal("none")),
});

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

	const allPurchases = await db.getPurchases();
	const linkablePurchases = allPurchases.filter(
		(p) =>
			(p.status === "pending" || p.status === "approved") &&
			!p.emailSent,
	);

	const linkedPurchase = receipt.purchaseId
		? allPurchases.find((p) => p.id === receipt.purchaseId) || null
		: null;

	if (
		linkedPurchase &&
		!linkablePurchases.find((p) => p.id === linkedPurchase.id)
	) {
		linkablePurchases.unshift(linkedPurchase);
	}

	return {
		siteConfig: SITE_CONFIG,
		receipt,
		linkablePurchases,
		linkedPurchase,
		receiptContent: await db.getReceiptContentByReceiptId(receipt.id),
	};
}

export async function action({ request, params }: Route.ActionArgs) {
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

	const formData = await request.formData();
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const purchaseId = formData.get("purchaseId") as string;
	const file = formData.get("file") as File | null;
	const tempUrl = formData.get("tempUrl") as string | null;
	const tempPathname = formData.get("tempPathname") as string | null;

	// OCR data from client-side analysis
	const ocrDataJson = formData.get("ocr_data") as string | null;
	let ocrData: {
		rawText: string;
		parsedData: any;
	} | null = null;

	if (ocrDataJson) {
		try {
			ocrData = JSON.parse(ocrDataJson);
		} catch (error) {
			console.error("Failed to parse OCR data:", error);
		}
	}

	const result = updateReceiptSchema.safeParse({
		name,
		description,
		purchaseId: purchaseId === "none" ? "" : purchaseId || "",
	});

	if (!result.success) {
		return {
			error: "Validation failed",
			fieldErrors: result.error.flatten().fieldErrors,
		};
	}

	const pathnameParts = receipt.pathname.split("/");
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	let nextUrl = receipt.url;
	let nextPathname = receipt.pathname;
	let nextName = name?.trim() || receipt.name || null;

	// Use temp file if available, otherwise check for new file upload
	if (tempUrl && tempPathname) {
		nextUrl = tempUrl;
		nextPathname = tempPathname;
	} else if (file) {
		const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (!RECEIPT_ALLOWED_TYPES.includes(fileExt as (typeof RECEIPT_ALLOWED_TYPES)[number])) {
			return {
				error: "invalid_file_type",
				allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
			};
		}
		if (
			!RECEIPT_ALLOWED_MIME_TYPES.includes(
				file.type as (typeof RECEIPT_ALLOWED_MIME_TYPES)[number],
			)
		) {
			return {
				error: "invalid_file_type",
				allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
			};
		}

		const pathname = buildReceiptPath(year, file.name, nextName || "kuitti");
		const storage = getReceiptStorage();
		const uploadResult = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});
		nextUrl = uploadResult.url;
		nextPathname = uploadResult.pathname;
		if (!name?.trim()) {
			nextName = file.name;
		}
	}

	await db.updateReceipt(params.receiptId, {
		name: nextName,
		description: description?.trim() || null,
		purchaseId:
			purchaseId && purchaseId !== "" && purchaseId !== "none"
				? purchaseId
				: null,
		url: nextUrl,
		pathname: nextPathname,
	});

	// Save OCR content if available (new file was uploaded with OCR analysis)
	if ((file || tempUrl) && ocrData) {
		try {
			// Delete existing content first
			const existingContent = await db.getReceiptContentByReceiptId(receipt.id);
			if (existingContent) {
				await db.deleteReceiptContent(existingContent.id);
			}

			// Create new content
			const content: NewReceiptContent = {
				receiptId: receipt.id,
				rawText: ocrData.rawText,
				storeName: ocrData.parsedData?.storeName || null,
				items: ocrData.parsedData?.items
					? JSON.stringify(ocrData.parsedData.items)
					: null,
				totalAmount: ocrData.parsedData?.totalAmount?.toString() || null,
				currency: ocrData.parsedData?.currency || "EUR",
				purchaseDate: ocrData.parsedData?.purchaseDate
					? new Date(ocrData.parsedData.purchaseDate)
					: null,
				aiModel: "OpenRouter via analyze API",
			};
			await db.createReceiptContent(content);
		} catch (error) {
			console.error("[Receipt Edit] Failed to save OCR content:", error);
		}
	}

	return redirect(`/treasury/receipts?year=${year}&success=receipt_updated`);
}

export default function TreasuryReceiptsEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { receipt, linkablePurchases, linkedPurchase, receiptContent } = loaderData;
	const { t } = useTranslation();

	const [name, setName] = useState(receipt.name || "");
	const [description, setDescription] = useState(receipt.description || "");
	const [purchaseId, setPurchaseId] = useState(receipt.purchaseId || "");
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

	const pathnameParts = receipt.pathname.split("/");
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	const currentPath = `/treasury/receipts/${receipt.id}/edit`;
	const currentFileName = receipt.pathname.split("/").pop() || "receipt";

	// Clear draft on successful submission
	const handleSubmit = () => {
		clearDraft();
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.receipts.edit")} />

				{actionData?.error && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
							{actionData.error === "invalid_file_type"
								? t("treasury.receipts.invalid_file_type", {
									types: (actionData.allowedTypes as string) || "",
								})
								: (actionData.error as string)}
					</div>
				)}

				<Form method="post" encType="multipart/form-data" className="space-y-6" onSubmit={handleSubmit}>
					<input type="hidden" name="purchaseId" value={purchaseId} />
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

					<TreasuryDetailCard title={t("treasury.receipts.edit")}>
						<ReceiptFormFields
							analyzeWithAI={analyzeWithAI}
							onAnalyzeChange={setAnalyzeWithAI}
							onFileChange={handleFileChange}
							isUploading={isUploading}
							isAnalyzing={isAnalyzing}
							name={name}
							onNameChange={setName}
							description={description}
							onDescriptionChange={setDescription}
							ocrData={ocrData}
							tempUrl={tempUrl}
							receiptId={receipt.id}
							onReanalyze={handleReanalyze}
							selectedFile={selectedFile}
							existingReceiptUrl={receipt.url}
							existingFileName={currentFileName}
							existingReceiptContent={receiptContent}
						/>

						<ReimbursementsPicker
							linkedReimbursement={linkedPurchase}
							unlinkedReimbursements={linkablePurchases}
							selectedReimbursementId={purchaseId}
							onSelectionChange={setPurchaseId}
							createUrl="/treasury/reimbursements/new"
							currentPath={currentPath}
							storageKey={`receipt-${receipt.id}-reimbursement`}
							sourceEntityType="receipt"
							sourceEntityId={receipt.id}
							sourceEntityName={receipt.name || ""}
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
