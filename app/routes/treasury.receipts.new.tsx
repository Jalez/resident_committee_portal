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
import { getDatabase, type NewReceipt, type NewReceiptContent } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_ALLOWED_TYPES } from "~/lib/constants";
import { getReceiptStorage } from "~/lib/receipts";
import { buildReceiptPath } from "~/lib/receipts/utils";
import type { Route } from "./+types/treasury.receipts.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi kuitti / New Receipt`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "treasury:receipts:write", getDatabase);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const selectedYear = yearParam
		? Number.parseInt(yearParam, 10)
		: currentYear;

	const allPurchases = await db.getPurchases();
	const linkablePurchases = allPurchases.filter(
		(p) =>
			(p.status === "pending" || p.status === "approved") &&
			!p.emailSent,
	);

	return {
		siteConfig: SITE_CONFIG,
		selectedYear,
		linkablePurchases,
	};
}

const createReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	purchaseId: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.or(z.literal("none")),
	year: z.coerce.number().int().min(2000).max(2100),
});

export async function action({ request }: Route.ActionArgs) {
	const authUser = await requirePermission(
		request,
		"treasury:receipts:write",
		getDatabase,
	);

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const tempUrl = formData.get("tempUrl") as string | null;
	const tempPathname = formData.get("tempPathname") as string | null;
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;

	const purchaseId = formData.get("purchaseId") as string;
	const year = Number.parseInt(formData.get("year") as string, 10);

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

	// Use temp URL if available, otherwise require file upload
	let blobUrl: string;
	let finalPathname: string;

	if (tempUrl && tempPathname) {
		// Use the temporary uploaded file
		blobUrl = tempUrl;
		finalPathname = tempPathname;
	} else if (file) {
		// Upload new file
		const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (
			!RECEIPT_ALLOWED_TYPES.includes(
				ext as (typeof RECEIPT_ALLOWED_TYPES)[number],
			)
		) {
			return {
				error: "invalid_file_type",
				allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
			};
		}

		const pathname = buildReceiptPath(
			String(year),
			file.name,
			name || "kuitti",
		);
		try {
			const storage = getReceiptStorage();
			const result = await storage.uploadFile(pathname, file, {
				access: "public",
				addRandomSuffix: true,
			});
			blobUrl = result.url;
			finalPathname = result.pathname;
		} catch (error) {
			console.error("[Receipt New] Upload error:", error);
			return { error: "upload_failed", message: "Failed to upload file" };
		}
	} else {
		return { error: "File is required" };
	}

	const result = createReceiptSchema.safeParse({
		name,
		description,
		purchaseId: purchaseId === "none" ? "" : purchaseId || "",
		year,
	});

	if (!result.success) {
		return {
			error: "Validation failed",
			fieldErrors: result.error.flatten().fieldErrors,
		};
	}

	const db = getDatabase();
	const receiptName = name?.trim() || "kuitti";
	const newReceipt: NewReceipt = {
		name: receiptName || null,
		description: description?.trim() || null,
		url: blobUrl,
		pathname: finalPathname,
		purchaseId:
			purchaseId && purchaseId !== "" && purchaseId !== "none"
				? purchaseId
				: null,
		createdBy: authUser.userId,
	};

	const savedReceipt = await db.createReceipt(newReceipt);

	// Save OCR content if available
	if (ocrData && savedReceipt) {
		try {
			const content: NewReceiptContent = {
				receiptId: savedReceipt.id,
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
			console.error("[Receipt New] Failed to save OCR content:", error);
		}
	}

	return redirect(
		`/treasury/receipts?year=${year}&success=receipt_created`,
	);
}

export default function TreasuryReceiptsNew({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { selectedYear, linkablePurchases } = loaderData;
	const { t } = useTranslation();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [purchaseId, setPurchaseId] = useState("");
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
		receiptId: "new",
		analyzeWithAI,
		onNameSuggestion: (suggestedName) => {
			if (!name) setName(suggestedName);
		},
		onDescriptionSuggestion: (suggestedDescription) => {
			if (!description) setDescription(suggestedDescription);
		},
	});

	const currentPath = "/treasury/receipts/new";

	// Clear draft on successful submission
	const handleSubmit = () => {
		clearDraft();
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader
					title={t("treasury.receipts.new", "New Receipt")}
				/>

				{actionData?.error === "invalid_file_type" && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
						{t("treasury.receipts.invalid_file_type", {
							types: actionData.allowedTypes as string,
						})}
					</div>
				)}

				{actionData?.error === "upload_failed" && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
						{(actionData.message as string) ||
							t("treasury.receipts.upload_error")}
					</div>
				)}

				<Form
					method="post"
					encType="multipart/form-data"
					className="space-y-6"
					onSubmit={handleSubmit}
				>
					<input type="hidden" name="year" value={selectedYear} />
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

					<TreasuryDetailCard title={t("treasury.receipts.new")}>
						<ReceiptFormFields
							analyzeWithAI={analyzeWithAI}
							onAnalyzeChange={setAnalyzeWithAI}
							onFileChange={handleFileChange}
							isUploading={isUploading}
							isAnalyzing={isAnalyzing}
							fileRequired={true}
							name={name}
							onNameChange={setName}
							description={description}
							onDescriptionChange={setDescription}
							ocrData={ocrData}
							tempUrl={tempUrl}
							receiptId="new"
							onReanalyze={handleReanalyze}
							selectedFile={selectedFile}
						/>

						<ReimbursementsPicker
							linkedReimbursement={null}
							unlinkedReimbursements={linkablePurchases}
							selectedReimbursementId={purchaseId}
							onSelectionChange={setPurchaseId}
							createUrl="/treasury/reimbursements/new"
							currentPath={currentPath}
							storageKey="receipt-new-reimbursement"
						/>
					</TreasuryDetailCard>

					<TreasuryFormActions
						saveLabel={t("treasury.receipts.form.create")}
						disabled={isAnalyzing || isUploading}
						onCancel={handleCancel}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
