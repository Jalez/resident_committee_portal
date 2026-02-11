import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDraft } from "~/contexts/form-draft-context";

interface ReceiptDraft {
	tempUrl?: string;
	tempPathname?: string;
	fileName?: string;
	ocrData?: {
		rawText: string;
		parsedData: any;
		suggestedName: string;
		suggestedDescription: string;
	};
}

interface UseReceiptUploadOptions {
	receiptId: string;
	analyzeWithAI: boolean;
	onNameSuggestion?: (name: string) => void;
	onDescriptionSuggestion?: (description: string) => void;
}

export function useReceiptUpload({
	receiptId,
	analyzeWithAI,
	onNameSuggestion,
	onDescriptionSuggestion,
}: UseReceiptUploadOptions) {
	const { t } = useTranslation();
	const { draft, isHydrated, saveDraft, clearDraft } = useDraft<ReceiptDraft>(
		"receipt",
		receiptId,
	);

	const [isUploading, setIsUploading] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [ocrData, setOcrData] = useState<{
		rawText: string;
		parsedData: any;
		suggestedName: string;
		suggestedDescription: string;
	} | null>(null);
	const [tempUrl, setTempUrl] = useState<string | null>(null);
	const [tempPathname, setTempPathname] = useState<string | null>(null);

	// Restore from draft on mount
	useEffect(() => {
		if (isHydrated && draft) {
			console.log("[useReceiptUpload] Restoring from draft:", draft);
			if (draft.tempUrl) {
				setTempUrl(draft.tempUrl);
			}
			if (draft.tempPathname) {
				setTempPathname(draft.tempPathname);
			}
			if (draft.ocrData) {
				setOcrData(draft.ocrData);
				if (draft.ocrData.suggestedName && onNameSuggestion) {
					onNameSuggestion(draft.ocrData.suggestedName);
				}
				if (draft.ocrData.suggestedDescription && onDescriptionSuggestion) {
					onDescriptionSuggestion(draft.ocrData.suggestedDescription);
				}
			}
			// Restore the file from the blob URL so the Extract button works
			if (draft.tempUrl && draft.fileName && !selectedFile) {
				console.log(
					"[useReceiptUpload] Fetching file from blob URL:",
					draft.tempUrl,
				);
				fetch(draft.tempUrl)
					.then((res) => res.blob())
					.then((blob) => {
						const file = new File([blob], draft.fileName || "receipt", {
							type: blob.type,
						});
						setSelectedFile(file);
						console.log(
							"[useReceiptUpload] Restored file from blob:",
							file.name,
						);
					})
					.catch((err) => {
						console.error(
							"[useReceiptUpload] Failed to fetch file from blob:",
							err,
						);
					});
			}
		} else {
			console.log(
				"[useReceiptUpload] No draft to restore. isHydrated:",
				isHydrated,
				"draft:",
				draft,
			);
		}
	}, [
		isHydrated,
		draft,
		onNameSuggestion,
		onDescriptionSuggestion,
		selectedFile,
	]);

	// Clean up temp blob on unmount
	useEffect(() => {
		return () => {
			if (tempPathname) {
				const formData = new FormData();
				formData.append("pathname", tempPathname);
				fetch("/api/receipts/delete-temp", {
					method: "POST",
					body: formData,
				}).catch((err) => console.error("Failed to delete temp file:", err));
			}
		};
	}, [tempPathname]);

	const analyzeReceipt = useCallback(
		async (file: File) => {
			setIsAnalyzing(true);
			const toastId = toast.loading(
				t("treasury.receipts.analyzing", "Analyzing receipt..."),
			);

			try {
				const formData = new FormData();
				formData.append("file", file);

				// Add timeout to prevent infinite loading
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

				const response = await fetch("/api/receipts/analyze", {
					method: "POST",
					body: formData,
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error("Failed to analyze receipt");
				}

				const result = await response.json();

				if (result.success) {
					const newOcrData = {
						rawText: result.rawText,
						parsedData: result.parsedData,
						suggestedName: result.suggestedName,
						suggestedDescription: result.suggestedDescription,
					};
					setOcrData(newOcrData);

					// Auto-fill callbacks
					if (result.suggestedName && onNameSuggestion) {
						onNameSuggestion(result.suggestedName);
					}
					if (result.suggestedDescription && onDescriptionSuggestion) {
						onDescriptionSuggestion(result.suggestedDescription);
					}

					// Save to draft
					const draftData = {
						tempUrl: tempUrl || undefined,
						tempPathname: tempPathname || undefined,
						fileName: file.name,
						ocrData: newOcrData,
					};
					console.log("[useReceiptUpload] Saving draft after OCR:", draftData);
					saveDraft(draftData);

					toast.success(
						t(
							"treasury.receipts.analysis_complete",
							"Receipt analyzed successfully",
						),
						{
							id: toastId,
						},
					);
				} else {
					throw new Error(result.error || "Analysis failed");
				}
			} catch (error) {
				console.error("OCR analysis failed:", error);
				const errorMessage =
					error instanceof Error && error.name === "AbortError"
						? t(
								"treasury.receipts.analysis_timeout",
								"Analysis timed out. The file may be too large or the server is slow.",
							)
						: t(
								"treasury.receipts.analysis_failed",
								"Failed to analyze receipt",
							);
				toast.error(errorMessage, { id: toastId });
			} finally {
				setIsAnalyzing(false);
			}
		},
		[
			tempUrl,
			tempPathname,
			onNameSuggestion,
			onDescriptionSuggestion,
			saveDraft,
			t,
		],
	);

	const handleFileChange = useCallback(
		async (file: File | null) => {
			setSelectedFile(file);
			setOcrData(null);

			if (!file) {
				return;
			}

			// Upload to temporary blob storage
			setIsUploading(true);
			const uploadToastId = toast.loading(
				t("treasury.receipts.uploading", "Uploading file..."),
			);

			try {
				const uploadFormData = new FormData();
				uploadFormData.append("file", file);

				// Add timeout to prevent infinite loading
				const uploadController = new AbortController();
				const uploadTimeoutId = setTimeout(
					() => uploadController.abort(),
					30000,
				); // 30 second timeout

				const uploadResponse = await fetch("/api/receipts/upload-temp", {
					method: "POST",
					body: uploadFormData,
					signal: uploadController.signal,
				});

				clearTimeout(uploadTimeoutId);

				if (!uploadResponse.ok) {
					throw new Error("Failed to upload file");
				}

				const uploadResult = await uploadResponse.json();

				if (uploadResult.success) {
					setTempUrl(uploadResult.url);
					setTempPathname(uploadResult.pathname);

					const draftData = {
						tempUrl: uploadResult.url,
						tempPathname: uploadResult.pathname,
						fileName: file.name,
						ocrData: undefined,
					};
					console.log(
						"[useReceiptUpload] Saving draft after upload:",
						draftData,
					);
					saveDraft(draftData);

					toast.success(
						t(
							"treasury.receipts.upload_complete",
							"File uploaded successfully",
						),
						{
							id: uploadToastId,
						},
					);

					// Analyze with AI if enabled
					if (analyzeWithAI) {
						await analyzeReceipt(file);
					}
				} else {
					throw new Error(uploadResult.error || "Upload failed");
				}
			} catch (error) {
				console.error("File upload failed:", error);
				const errorMessage =
					error instanceof Error && error.name === "AbortError"
						? t(
								"treasury.receipts.upload_timeout",
								"Upload timed out. The file may be too large.",
							)
						: t("treasury.receipts.upload_failed", "Failed to upload file");
				toast.error(errorMessage, { id: uploadToastId });
			} finally {
				setIsUploading(false);
			}
		},
		[analyzeWithAI, analyzeReceipt, saveDraft, t],
	);

	const handleReanalyze = useCallback(async () => {
		if (selectedFile) {
			await analyzeReceipt(selectedFile);
		}
	}, [selectedFile, analyzeReceipt]);

	const handleCancel = useCallback(async () => {
		if (tempPathname) {
			const formData = new FormData();
			formData.append("pathname", tempPathname);
			await fetch("/api/receipts/delete-temp", {
				method: "POST",
				body: formData,
			}).catch((err) => console.error("Failed to delete temp file:", err));
		}
		clearDraft();
	}, [tempPathname, clearDraft]);

	return {
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
	};
}
