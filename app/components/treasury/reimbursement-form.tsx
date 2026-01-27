import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import {
	type ReceiptLink,
	ReceiptPicker,
} from "~/components/treasury/receipt-picker";
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
	/** URL to the receipts folder in Drive */
	receiptsFolderUrl: string;
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
	receiptsFolderUrl,
	description = "",
	showNotes = true,
	showEmailWarning = true,
	className = "",
	required = true,
}: ReimbursementFormProps) {
	const fetcher = useFetcher();
	const minutesFetcher = useFetcher<{ minutes: MinuteFile[] }>();
	const ensureFolderFetcher = useFetcher();
	const [selectedReceipts, setSelectedReceipts] = useState<ReceiptLink[]>([]);
	const [minutesOptions, setMinutesOptions] = useState<MinuteFile[]>(
		recentMinutes,
	);
	const [selectedMinutes, setSelectedMinutes] = useState<MinuteFile | null>(
		recentMinutes[0] || null,
	);
	const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
	const [descriptionValue, setDescriptionValue] = useState(description);
	const [currentFolderUrl, setCurrentFolderUrl] = useState(receiptsFolderUrl);
	const { t } = useTranslation();
	const isMinutesLoading = minutesFetcher.state !== "idle";

	// Ensure receipts folder exists on mount
	useEffect(() => {
		// Only trigger if we don't already have a valid folder URL
		if (!receiptsFolderUrl || receiptsFolderUrl === "#") {
			const formData = new FormData();
			formData.append("_action", "ensureReceiptsFolder");
			formData.append("year", currentYear.toString());
			ensureFolderFetcher.submit(formData, { method: "post" });
		}
	}, [currentYear, receiptsFolderUrl, ensureFolderFetcher.submit]);

	// Handle folder creation response
	useEffect(() => {
		if (ensureFolderFetcher.state === "idle" && ensureFolderFetcher.data) {
			const data = ensureFolderFetcher.data as {
				success: boolean;
				folderUrl?: string;
			};
			if (data.success && data.folderUrl) {
				setCurrentFolderUrl(data.folderUrl);
			}
		}
	}, [ensureFolderFetcher.state, ensureFolderFetcher.data]);

	// Promise resolver for upload callback
	const uploadResolverRef = useRef<
		((receipt: ReceiptLink | null) => void) | null
	>(null);

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

	// Handle receipt upload completion
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data) {
			setIsUploadingReceipt(false);
			const data = fetcher.data as {
				success: boolean;
				receipt?: ReceiptLink;
				error?: string;
			};
			if (data.success && data.receipt) {
				const newReceipt = data.receipt;
				setSelectedReceipts((prev) => [...prev, newReceipt]);
				toast.success(t("treasury.new_reimbursement.receipt_uploaded"));
				// Resolve the upload promise
				if (uploadResolverRef.current) {
					uploadResolverRef.current(data.receipt);
					uploadResolverRef.current = null;
				}
			} else if (data.error) {
				toast.error(`${t("treasury.new_reimbursement.error")}: ${data.error}`);
				// Resolve with null on error
				if (uploadResolverRef.current) {
					uploadResolverRef.current(null);
					uploadResolverRef.current = null;
				}
			}
		}
	}, [fetcher.state, fetcher.data, t]);

	const handleUploadReceipt = useCallback(
		async (
			file: File,
			year: string,
			desc: string,
		): Promise<ReceiptLink | null> => {
			setIsUploadingReceipt(true);

			return new Promise((resolve) => {
				uploadResolverRef.current = resolve;

				const formData = new FormData();
				formData.append("_action", "uploadReceipt");
				formData.append("receiptFile", file);
				formData.append("year", year);
				formData.append("description", desc || "kuitti");
				fetcher.submit(formData, {
					method: "post",
					encType: "multipart/form-data",
				});
			});
		},
		[fetcher],
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
			<div className="space-y-2">
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
					receiptsFolderUrl={currentFolderUrl}
					description={descriptionValue}
				/>
				{/* Hidden input for form submission */}
				<input
					type="hidden"
					name="receiptLinks"
					value={JSON.stringify(selectedReceipts)}
				/>
				{required && selectedReceipts.length === 0 && (
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
				<input
					type="hidden"
					name="minutesUrl"
					value={
						selectedMinutes?.url ||
						(selectedMinutes?.id
							? `https://drive.google.com/file/d/${selectedMinutes.id}/view`
							: "")
					}
				/>
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
