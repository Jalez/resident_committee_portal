import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useRevalidator } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	RECEIPT_ALLOWED_TYPES,
	RECEIPT_MAX_SIZE_BYTES,
	RECEIPT_MAX_SIZE_MB,
} from "~/lib/constants";

export interface ReceiptLink {
	id: string;
	name: string;
	url: string;
}

interface ReceiptsByYear {
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

interface ReceiptPickerProps {
	/** Receipts grouped by year from Google Drive */
	receiptsByYear: ReceiptsByYear[];
	/** Currently selected receipts */
	selectedReceipts: ReceiptLink[];
	/** Callback when selection changes */
	onSelectionChange: (receipts: ReceiptLink[]) => void;
	/** Callback to upload a new receipt - returns the uploaded file info */
	onUploadReceipt?: (
		file: File,
		year: string,
		description: string,
	) => Promise<ReceiptLink | null>;
	/** Current year for uploads */
	currentYear: number;
	/** Whether upload is in progress */
	isUploading?: boolean;
	/** URL to the receipts folder for the current year (for manual upload instructions) */
	receiptsFolderUrl?: string;
	/** Description to use for naming uploaded receipts */
	description?: string;
}

export function ReceiptPicker({
	receiptsByYear,
	selectedReceipts,
	onSelectionChange,
	onUploadReceipt,
	currentYear,
	isUploading = false,
	receiptsFolderUrl,
	description = "",
}: ReceiptPickerProps) {
	const refreshFetcher = useFetcher();
	const revalidator = useRevalidator();
	const [isOpen, setIsOpen] = useState(false);
	const [selectedYear, setSelectedYear] = useState(currentYear.toString());
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { t } = useTranslation();

	const isRefreshing =
		refreshFetcher.state !== "idle" || revalidator.state !== "idle";

	// Get receipts for selected year
	const yearData = receiptsByYear.find((r) => r.year === selectedYear);
	const receiptsForYear = yearData?.files || [];
	const folderUrl = yearData?.folderUrl || receiptsFolderUrl || "#";

	// Filter receipts by search query
	const filteredReceipts = receiptsForYear.filter((r) =>
		r.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	// Check if a receipt is selected
	const isSelected = (receiptId: string) =>
		selectedReceipts.some((r) => r.id === receiptId);

	// Toggle receipt selection
	const toggleReceipt = (receipt: {
		id: string;
		name: string;
		url: string;
	}) => {
		if (isSelected(receipt.id)) {
			onSelectionChange(selectedReceipts.filter((r) => r.id !== receipt.id));
		} else {
			onSelectionChange([
				...selectedReceipts,
				{ id: receipt.id, name: receipt.name, url: receipt.url },
			]);
		}
	};

	// Remove a receipt from selection
	const removeReceipt = (receiptId: string) => {
		onSelectionChange(selectedReceipts.filter((r) => r.id !== receiptId));
	};

	// Handle refresh button click
	const handleRefresh = () => {
		const formData = new FormData();
		formData.append("_action", "refreshReceipts");
		refreshFetcher.submit(formData, { method: "post" });

		// Revalidate to refetch loader data after cache is cleared
		setTimeout(() => {
			revalidator.revalidate();
		}, 100);
	};

	// Handle file selection for upload
	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setUploadError(null);

		const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (
			!RECEIPT_ALLOWED_TYPES.includes(
				fileExt as (typeof RECEIPT_ALLOWED_TYPES)[number],
			)
		) {
			setUploadError(
				t("receipts.invalid_type", { types: RECEIPT_ALLOWED_TYPES.join(", ") }),
			);
			return;
		}

		// Validate file size
		if (file.size > RECEIPT_MAX_SIZE_BYTES) {
			setUploadError(
				t("receipts.file_too_large", { size: RECEIPT_MAX_SIZE_MB }),
			);
			return;
		}

		if (!onUploadReceipt) {
			setUploadError(t("receipts.upload_unavailable"));
			return;
		}

		// Upload the file
		const result = await onUploadReceipt(file, selectedYear, description);
		if (result) {
			// Add to selection automatically
			onSelectionChange([...selectedReceipts, result]);
			// Clear file input
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		} else {
			setUploadError(t("receipts.upload_failed"));
		}
	};

	return (
		<div className="space-y-3">
			{/* Selected Receipts Display */}
			{selectedReceipts.length > 0 && (
				<div className="space-y-2">
					<Label className="text-sm text-muted-foreground">
						{t("receipts.selected")} ({selectedReceipts.length})
					</Label>
					<div className="flex flex-wrap gap-2">
						{selectedReceipts.map((receipt) => (
							<Badge
								key={receipt.id}
								variant="secondary"
								className="flex items-center gap-2 py-1.5 px-3 text-sm"
							>
								<span className="material-symbols-outlined text-base">
									receipt_long
								</span>
								<a
									href={receipt.url}
									target="_blank"
									rel="noopener noreferrer"
									className="hover:underline max-w-[200px] truncate"
									onClick={(e) => e.stopPropagation()}
								>
									{receipt.name}
								</a>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => removeReceipt(receipt.id)}
									className="h-6 w-6 ml-1 text-muted-foreground hover:text-destructive hover:bg-transparent"
									aria-label={`${t("receipts.delete")} ${receipt.name}`}
								>
									<span className="material-symbols-outlined text-base">
										delete
									</span>
								</Button>
							</Badge>
						))}
					</div>
				</div>
			)}

			{/* Hidden inputs for form submission */}
			<input
				type="hidden"
				name="receiptLinks"
				value={JSON.stringify(selectedReceipts)}
			/>

			{/* Picker Dialog */}
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full border-dashed border-2 py-6 hover:bg-gray-50 dark:hover:bg-gray-800"
					>
						<span className="material-symbols-outlined mr-2">add_circle</span>
						{selectedReceipts.length > 0
							? t("receipts.add_more")
							: t("receipts.select_receipts")}
					</Button>
				</DialogTrigger>

				{/* Link to Drive folder - always visible */}
				{folderUrl && folderUrl !== "#" && (
					<div className="flex justify-end">
						<a
							href={folderUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
						>
							<span className="material-symbols-outlined text-base">
								folder_open
							</span>
							{t("receipts.open_drive")}
						</a>
					</div>
				)}

				<DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-6">
					<DialogHeader>
						<DialogTitle>{t("receipts.select_receipts")}</DialogTitle>
						<DialogDescription>
							{t(
								"receipts.select_existing_or_upload",
								"Select existing receipts from Google Drive or upload a new one.",
							)}
						</DialogDescription>
					</DialogHeader>

					<div className="flex-1 overflow-auto min-h-0 space-y-4">
						{/* Year Filter & Search */}
						<div className="flex gap-2">
							<div className="w-32">
								<Select value={selectedYear} onValueChange={setSelectedYear}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{receiptsByYear.map((r) => (
											<SelectItem key={r.year} value={r.year}>
												{r.year}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex-1">
								<Input
									placeholder={t("receipts.search_placeholder") as string}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
								/>
							</div>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={handleRefresh}
								disabled={isRefreshing}
								title={t("receipts.refresh") as string}
							>
								<span className="material-symbols-outlined">
									{isRefreshing ? "sync" : "refresh"}
								</span>
							</Button>
						</div>

						{/* Upload Section */}
						{onUploadReceipt && (
							<div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
								<Label className="font-medium">
									{t("receipts.upload_new")}
								</Label>
								<div className="flex gap-2">
									<Input
										ref={fileInputRef}
										type="file"
										accept={RECEIPT_ALLOWED_TYPES.join(",")}
										onChange={handleFileSelect}
										disabled={isUploading}
										className="flex-1"
									/>
								</div>
								<p className="text-xs text-muted-foreground">
									Max {RECEIPT_MAX_SIZE_MB}MB.{" "}
									{t("receipts.allowed", "Allowed")}:{" "}
									{RECEIPT_ALLOWED_TYPES.join(", ")}
								</p>

								{uploadError && (
									<div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
										<p className="text-sm text-yellow-800 dark:text-yellow-200">
											⚠️ {uploadError}
										</p>
										{folderUrl && folderUrl !== "#" && (
											<a
												href={folderUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:underline"
											>
												<span className="material-symbols-outlined text-base">
													folder_open
												</span>
												{t("receipts.open_folder")}
											</a>
										)}
									</div>
								)}

								{isUploading && (
									<p className="text-sm text-muted-foreground animate-pulse">
										{t("receipts.uploading")}
									</p>
								)}
							</div>
						)}

						{/* Receipts List */}
						<div className="border rounded-lg divide-y max-h-[300px] overflow-auto">
							{filteredReceipts.length === 0 ? (
								<div className="p-8 text-center text-muted-foreground">
									<span className="material-symbols-outlined text-4xl mb-2 block">
										folder_off
									</span>
									<p>{t("receipts.no_receipts", { year: selectedYear })}</p>
									{folderUrl && folderUrl !== "#" && (
										<a
											href={folderUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:underline"
										>
											<span className="material-symbols-outlined text-base">
												folder_open
											</span>
											{t("receipts.open_folder")}
										</a>
									)}
								</div>
							) : (
								filteredReceipts.map((receipt) => {
									const id = `receipt-toggle-${receipt.id}`;
									return (
										<label
											key={receipt.id}
											htmlFor={id}
											className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
										>
											<Checkbox
												id={id}
												checked={isSelected(receipt.id)}
												onCheckedChange={() => toggleReceipt(receipt)}
											/>
											<span className="material-symbols-outlined text-muted-foreground">
												receipt_long
											</span>
											<span className="flex-1 truncate">{receipt.name}</span>
											<a
												href={receipt.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 hover:underline text-sm"
												onClick={(e) => e.stopPropagation()}
											>
												{t("receipts.open")}
											</a>
										</label>
									);
								})
							)}
						</div>
					</div>

					<div className="flex justify-between items-center pt-4 border-t">
						{folderUrl && folderUrl !== "#" && (
							<a
								href={folderUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
							>
								<span className="material-symbols-outlined text-base">
									open_in_new
								</span>
								{t("receipts.open_drive")}
							</a>
						)}
						<Button onClick={() => setIsOpen(false)}>
							{t("receipts.done")} ({selectedReceipts.length}{" "}
							{t("receipts.selected_count", "selected")})
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
