import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import {
	type ReceiptLink,
	ReceiptPicker,
} from "~/components/treasury/receipt-picker";
import {
	hasRequiredReceipts,
	RECEIPTS_SECTION_ID,
} from "~/lib/treasury/receipt-validation";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export interface MinuteFile {
	id: string;
	name: string;
	url?: string;
	year: string;
}

export interface ReceiptsByYear {
	year: string;
	files: {
		id: string;
		name: string;
		url: string;
		createdTime: string;
	}[];
	folderUrl: string;
	folderId: string;
}

export interface ReimbursementFormProps {
	/** Minutes files for the dropdown */
	recentMinutes: MinuteFile[];
	/** Whether email sending is configured */
	emailConfigured: boolean;
	/** Receipts organized by year for the picker */
	receiptsByYear: ReceiptsByYear[];
	/** Current year for receipt uploads */
	currentYear: number;
	/** Optional description to prefill for receipt naming */
	description?: string;
	/** Whether to show the notes field (default: true) */
	showNotes?: boolean;
	/** Whether to show the email warning (default: true) */
	showEmailWarning?: boolean;
	/** Optional class name for styling */
	className?: string;
	/** Whether all fields are required (default: true) */
	required?: boolean;
	/** Initial purchaser name (for template pre-fill) */
	initialPurchaserName?: string;
	/** Initial bank account (for template pre-fill) */
	initialBankAccount?: string;
	/** Initial notes (for template pre-fill) */
	initialNotes?: string;
}

export interface ReimbursementFormData {
	selectedReceipts: ReceiptLink[];
	selectedMinutes: MinuteFile | null;
}

/**
 * Reusable reimbursement form component that handles:
 * - Receipt selection/upload via ReceiptPicker
 * - Purchaser name and bank account inputs
 * - Minutes selection dropdown
 * - Notes textarea (optional)
 *
 * This component manages its own state for receipts and minutes selection,
 * and exposes hidden inputs for form submission.
 */
export function ReimbursementForm({
	recentMinutes,
	emailConfigured,
	receiptsByYear,
	currentYear,
	description = "",
	showNotes = true,
	showEmailWarning = true,
	className = "",
	required = true,
	initialPurchaserName = "",
	initialBankAccount = "",
	initialNotes = "",
}: ReimbursementFormProps) {
	const minutesFetcher = useFetcher<{ minutes: MinuteFile[] }>();
	const [selectedReceipts, setSelectedReceipts] = useState<ReceiptLink[]>([]);
	const [minutesOptions, setMinutesOptions] = useState<MinuteFile[]>(
		recentMinutes,
	);
	const [selectedMinutes, setSelectedMinutes] = useState<MinuteFile | null>(
		recentMinutes[0] || null,
	);
	const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
	const [descriptionValue, setDescriptionValue] = useState(description);
	const { t } = useTranslation();
	const isMinutesLoading = minutesFetcher.state !== "idle";
	const receiptsValid = hasRequiredReceipts(selectedReceipts, required);

	// Sync description prop to internal state
	useEffect(() => {
		setDescriptionValue(description);
	}, [description]);
	// Load minutes asynchronously
	useEffect(() => {
		if (minutesOptions.length === 0 && minutesFetcher.state === "idle") {
			minutesFetcher.load("/api/minutes?limit=20");
		}
	}, [minutesFetcher, minutesFetcher.state, minutesOptions.length]);

	// Update minutes options when data arrives
	useEffect(() => {
		if (minutesFetcher.state === "idle" && minutesFetcher.data?.minutes) {
			setMinutesOptions(minutesFetcher.data.minutes);
			if (!selectedMinutes && minutesFetcher.data.minutes.length > 0) {
				setSelectedMinutes(minutesFetcher.data.minutes[0]);
			}
		}
	}, [minutesFetcher.data, minutesFetcher.state, selectedMinutes]);

	const handleUploadReceipt = useCallback(
		async (
			file: File,
			year: string,
			desc: string,
			ocrEnabled = false,
		): Promise<ReceiptLink | null> => {
			setIsUploadingReceipt(true);
			try {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("year", year);
				formData.append("description", desc || "kuitti");
				formData.append("ocr_enabled", String(ocrEnabled));

				const response = await fetch("/api/receipts/upload", {
					method: "POST",
					body: formData,
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({ error: "Upload failed" }));
					throw new Error(errorData.error || "Upload failed");
				}

				const data = await response.json();
				toast.success(t("treasury.new_reimbursement.receipt_uploaded"));
				return {
					id: data.pathname,
					name: data.pathname.split("/").pop() || file.name,
					url: data.url,
				};
			} catch (error) {
				console.error("[uploadReceipt] Error:", error);
				const errorMessage = error instanceof Error ? error.message : t("receipts.upload_failed");
				toast.error(
					`${t("treasury.new_reimbursement.error")}: ${errorMessage}`,
				);
				return null;
			} finally {
				setIsUploadingReceipt(false);
			}
		},
		[t],
	);

	return (
		<div className={`space-y-4 ${className}`}>
			{/* Email warning */}
			{showEmailWarning && !emailConfigured && (
				<div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
					<p className="text-sm text-yellow-800 dark:text-yellow-200">
						{t("treasury.new_reimbursement.email_warning")}
					</p>
				</div>
			)}

			{/* Receipt Picker */}
			<div
				id={RECEIPTS_SECTION_ID}
				tabIndex={-1}
				className="space-y-2 focus:outline-none"
			>
				<Label>
					{t("treasury.new_reimbursement.receipts")} {required && "*"}
				</Label>
				<ReceiptPicker
					receiptsByYear={receiptsByYear}
					selectedReceipts={selectedReceipts}
					onSelectionChange={setSelectedReceipts}
					onUploadReceipt={handleUploadReceipt}
					currentYear={currentYear}
					isUploading={isUploadingReceipt}
					description={descriptionValue}
				/>
				{/* Hidden input for form submission */}
				<input
					type="hidden"
					name="receiptLinks"
					value={JSON.stringify(selectedReceipts)}
				/>
				{!receiptsValid && (
					<p className="text-xs text-destructive">
						{t("treasury.new_reimbursement.select_receipt_error")}
					</p>
				)}
			</div>

			{/* Purchaser Info */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="purchaserName">
						{t("treasury.new_reimbursement.purchaser_name")} {required && "*"}
					</Label>
					<Input
						id="purchaserName"
						name="purchaserName"
						required={required}
						defaultValue={initialPurchaserName}
						placeholder={t("treasury.new_reimbursement.purchaser_placeholder")}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="bankAccount">
						{t("treasury.new_reimbursement.bank_account")} {required && "*"}
					</Label>
					<Input
						id="bankAccount"
						name="bankAccount"
						required={required}
						defaultValue={initialBankAccount}
						placeholder="FI12 3456 7890 1234 56"
					/>
				</div>
			</div>

			{/* Minutes Selection */}
			<div className="space-y-2">
				<Label htmlFor="minutesId">
					{t("treasury.new_reimbursement.minutes")} {required && "*"}
				</Label>
				{minutesOptions.length === 0 && isMinutesLoading ? (
					<div className="rounded-md border border-input bg-muted/20 px-3 py-2 text-sm text-muted-foreground animate-pulse">
						{t(
							"treasury.new_reimbursement.loading_minutes",
							"Loading minutes...",
						)}
					</div>
				) : (
					<Select
						name="minutesId"
						value={selectedMinutes?.id || ""}
						required={required}
						onValueChange={(value) => {
							const selected = minutesOptions.find((m) => m.id === value);
							setSelectedMinutes(selected || null);
						}}
					>
						<SelectTrigger>
							<SelectValue
								placeholder={t("treasury.new_reimbursement.select_minutes")}
							/>
						</SelectTrigger>
						<SelectContent>
							{minutesOptions.map((minute) => (
								<SelectItem key={minute.id} value={minute.id}>
									{minute.name} ({minute.year})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
				{/* Hidden inputs for minutes metadata */}
				<input
					type="hidden"
					name="minutesName"
					value={selectedMinutes?.name || ""}
				/>
				{/* minutesUrl removed - files are attached instead of linked */}
				<p className="text-xs text-gray-500">
					{t("treasury.new_reimbursement.minutes_help")}
				</p>
			</div>

			{/* Notes (optional) */}
			{showNotes && (
				<div className="space-y-2">
					<Label htmlFor="notes">{t("treasury.new_reimbursement.notes")}</Label>
					<textarea
						id="notes"
						name="notes"
						className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
						placeholder={t("treasury.new_reimbursement.notes_placeholder")}
						defaultValue={initialNotes}
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Hook to get description value for the ReimbursementForm.
 * Use this when you need to pass the description from a parent form field.
 */
export function useReimbursementDescription() {
	const [description, setDescription] = useState("");
	return { description, setDescription };
}
