import { useTranslation } from "react-i18next";
import { ParsedReceiptDisplay } from "~/components/treasury/parsed-receipt-display";
import { ReceiptContentsDisplay } from "~/components/treasury/receipt-contents-display";
import { TreasuryField } from "~/components/treasury/treasury-detail-components";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FileUpload } from "~/components/ui/file-upload";
import type { Receipt } from "~/db";
import { RECEIPT_ALLOWED_TYPES } from "~/lib/constants";

interface ReceiptFormFieldsProps {
	// File upload props
	analyzeWithAI: boolean;
	onAnalyzeChange: (checked: boolean) => void;
	onFileChange: (file: File | null) => void;
	isUploading: boolean;
	isAnalyzing: boolean;
	fileRequired?: boolean;

	// Form fields
	name: string;
	onNameChange: (value: string) => void;
	description: string;
	onDescriptionChange: (value: string) => void;

	// OCR display
	ocrData?: {
		rawText: string;
		parsedData: any;
		suggestedName: string;
		suggestedDescription: string;
	} | null;
	tempUrl?: string | null;
	receiptId: string;
	onReanalyze?: () => void;
	selectedFile?: File | null;

	// Optional existing receipt file
	existingReceiptUrl?: string;
	existingFileName?: string;

	// Optional existing receipt with OCR content
	existingReceipt?: Pick<
		Receipt,
		| "rawText"
		| "storeName"
		| "items"
		| "totalAmount"
		| "currency"
		| "purchaseDate"
		| "aiModel"
		| "ocrProcessed"
	> | null;
}

export function ReceiptFormFields({
	analyzeWithAI,
	onAnalyzeChange,
	onFileChange,
	isUploading,
	isAnalyzing,
	fileRequired = false,
	name,
	onNameChange,
	description,
	onDescriptionChange,
	ocrData,
	tempUrl,
	receiptId,
	onReanalyze,
	selectedFile,
	existingReceiptUrl,
	existingFileName,
	existingReceipt,
}: ReceiptFormFieldsProps) {
	const { t } = useTranslation();

	return (
		<>
			<div className="grid gap-4">
				{/* Analyze with AI checkbox */}
				<div className="flex items-center space-x-2 pb-2 border-b">
					<Checkbox
						id="analyze_ai"
						checked={analyzeWithAI}
						onCheckedChange={(checked) => onAnalyzeChange(checked === true)}
					/>
					<label
						htmlFor="analyze_ai"
						className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
					>
						{t("treasury.receipts.analyze_with_ai", "Analyze with AI (OCR)")}
					</label>
				</div>

				{/* Show existing receipt file if editing and NO new file is uploaded */}
				{!tempUrl && existingReceiptUrl && existingFileName && (
					<TreasuryField
						label={t("treasury.receipts.receipt_file", "Receipt File")}
						valueClassName="text-foreground"
					>
						<Button
							asChild
							variant="outline"
							size="sm"
							className="w-full max-w-full h-auto justify-start py-2"
						>
							<a
								href={tempUrl || existingReceiptUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="w-full min-w-0 justify-start items-start gap-2"
								title={existingFileName}
							>
								<span className="material-symbols-outlined text-base shrink-0">
									open_in_new
								</span>
								<span className="block min-w-0 text-left whitespace-normal break-all">
									{existingFileName}
								</span>
							</a>
						</Button>
					</TreasuryField>
				)}

				{/* Show uploaded temp file for new receipts */}
				{tempUrl && (
					<TreasuryField
						label={t("treasury.receipts.uploaded_file", "Uploaded File")}
						valueClassName="text-foreground"
					>
						<div className="flex items-center gap-2">
							<Button asChild variant="outline" size="sm">
								<a href={tempUrl} target="_blank" rel="noopener noreferrer">
									<span className="material-symbols-outlined text-base">
										open_in_new
									</span>
									{t("treasury.receipts.view_file", "View File")}
								</a>
							</Button>
							<span className="text-sm text-muted-foreground">
								{t("treasury.receipts.file_ready", "File uploaded and ready")}
							</span>
						</div>
					</TreasuryField>
				)}

				{/* File upload */}
				<div
					className={
						isAnalyzing || isUploading ? "opacity-50 pointer-events-none" : ""
					}
				>
					<FileUpload
						name="file"
						id="file"
						accept={[...RECEIPT_ALLOWED_TYPES]}
						required={fileRequired && !tempUrl}
						label={
							tempUrl || existingReceiptUrl
								? t("treasury.receipts.replace_file", "Replace receipt file")
								: t("treasury.receipts.file")
						}
						helperText={
							tempUrl && !existingReceiptUrl
								? t(
									"treasury.receipts.optional_replace",
									"Optional: upload a different file",
								)
								: `${t("treasury.receipts.allowed_types")}: ${RECEIPT_ALLOWED_TYPES.join(", ")}`
						}
						onFileChange={onFileChange}
					/>
				</div>

				{/* Upload progress indicator */}
				{isUploading && (
					<div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md dark:bg-blue-900/30 dark:text-blue-300">
						<span className="material-symbols-outlined text-base animate-spin">
							progress_activity
						</span>
						{t("treasury.receipts.uploading", "Uploading file...")}
					</div>
				)}

				{/* Analysis progress indicator */}
				{isAnalyzing && (
					<div className="flex flex-col gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md dark:bg-blue-900/30 dark:text-blue-300">
						<div className="flex items-center gap-2">
							<span className="material-symbols-outlined text-base animate-spin">
								progress_activity
							</span>
							{t("treasury.receipts.analyzing", "Analyzing receipt...")}
						</div>
						<p className="text-xs text-blue-500 dark:text-blue-400">
							{t(
								"treasury.receipts.analysis_note",
								"This may take up to 60 seconds for large files or when using free AI models.",
							)}
						</p>
					</div>
				)}

				{/* Name and description fields */}
				<TreasuryField
					mode="edit"
					label={t("common.fields.name")}
					name="name"
					type="text"
					value={name}
					onChange={onNameChange}
					placeholder={t("treasury.receipts.name_placeholder")}
				/>
				<TreasuryField
					mode="edit"
					label={t("common.fields.description")}
					name="description"
					type="textarea"
					value={description}
					onChange={onDescriptionChange}
					placeholder={t("treasury.receipts.description_placeholder")}
				/>
			</div>

			{/* Display parsed receipt content or retry button for NEW uploads */}
			{tempUrl ? (
				<div className="mt-6 space-y-4">
					<div className="flex justify-between items-center">
						<h3 className="text-lg font-medium">
							{ocrData
								? t("treasury.receipts.parsed_content", "Parsed Content")
								: t(
									"treasury.receipts.extract_content",
									"Extract Receipt Content",
								)}
						</h3>
						{onReanalyze && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={onReanalyze}
								disabled={isAnalyzing || (!selectedFile && !tempUrl)}
							>
								<span className="material-symbols-outlined mr-2 text-base">
									document_scanner
								</span>
								{ocrData
									? t("treasury.receipts.extract_text", "Extract Text")
									: t("treasury.receipts.try_extract", "Try Extracting")}
							</Button>
						)}
					</div>
					{ocrData ? (
						<ParsedReceiptDisplay
							parsedData={ocrData.parsedData}
							rawText={ocrData.rawText}
							aiModel="OpenRouter via analyze API"
						/>
					) : (
						<div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
							<p className="text-sm text-muted-foreground">
								{t(
									"treasury.receipts.no_extraction_yet",
									"File uploaded. Click 'Try Extracting' to extract text from the receipt.",
								)}
							</p>
						</div>
					)}
				</div>
			) : existingReceipt && existingReceiptUrl ? (
				<div className="mt-6">
					<ReceiptContentsDisplay
						receiptId={receiptId}
						receiptUrl={existingReceiptUrl}
						receipt={existingReceipt}
					/>
				</div>
			) : null}
		</>
	);
}
