import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDraft } from "~/contexts/form-draft-context";
import type { FileEntityType } from "~/lib/file-upload-types";
import { FILE_TYPE_CONFIGS, getAllowedExtensionsString } from "~/lib/file-upload-types";

interface FileDraft {
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

interface UseFileUploadOptions {
	entityType: FileEntityType;
	entityId: string;
	year?: string;
	enableAI?: boolean;
	onNameSuggestion?: (name: string) => void;
	onDescriptionSuggestion?: (description: string) => void;
	onUploadComplete?: (result: { url: string; pathname: string }) => void;
}

export function useFileUpload({
	entityType,
	entityId,
	year,
	enableAI = false,
	onNameSuggestion,
	onDescriptionSuggestion,
	onUploadComplete,
}: UseFileUploadOptions) {
	const { t } = useTranslation();
	const { draft, isHydrated, saveDraft, clearDraft } = useDraft<FileDraft>(
		entityType,
		entityId,
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

	useEffect(() => {
		if (isHydrated && draft) {
			if (draft.tempUrl) setTempUrl(draft.tempUrl);
			if (draft.tempPathname) setTempPathname(draft.tempPathname);
			if (draft.ocrData) {
				setOcrData(draft.ocrData);
				if (draft.ocrData.suggestedName && onNameSuggestion) {
					onNameSuggestion(draft.ocrData.suggestedName);
				}
				if (draft.ocrData.suggestedDescription && onDescriptionSuggestion) {
					onDescriptionSuggestion(draft.ocrData.suggestedDescription);
				}
			}
			if (draft.tempUrl && draft.fileName && !selectedFile) {
				fetch(draft.tempUrl)
					.then((res) => res.blob())
					.then((blob) => {
						const file = new File([blob], draft.fileName || "file", {
							type: blob.type,
						});
						setSelectedFile(file);
					})
					.catch((err) => {
						console.error("[useFileUpload] Failed to fetch file from blob:", err);
					});
			}
		}
	}, [isHydrated, draft, onNameSuggestion, onDescriptionSuggestion, selectedFile]);

	// Intentionally do not auto-delete temp files on unmount.
	// Users may navigate away (e.g. via relationship picker) and return,
	// and draft state should remain recoverable until explicit cancel/save flow.

	const analyzeFile = useCallback(
		async (file: File) => {
			if (!enableAI || entityType !== "receipt") return;

			setIsAnalyzing(true);
			const toastId = toast.loading(t("treasury.receipts.analyzing", "Analyzing..."));

			try {
				const formData = new FormData();
				formData.append("file", file);

				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 60000);

				const response = await fetch("/api/receipts/analyze", {
					method: "POST",
					body: formData,
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) throw new Error("Failed to analyze file");

				const result = await response.json();

				if (result.success) {
					const newOcrData = {
						rawText: result.rawText,
						parsedData: result.parsedData,
						suggestedName: result.suggestedName,
						suggestedDescription: result.suggestedDescription,
					};
					setOcrData(newOcrData);

					if (result.suggestedName && onNameSuggestion) {
						onNameSuggestion(result.suggestedName);
					}
					if (result.suggestedDescription && onDescriptionSuggestion) {
						onDescriptionSuggestion(result.suggestedDescription);
					}

					saveDraft({
						tempUrl: tempUrl || undefined,
						tempPathname: tempPathname || undefined,
						fileName: file.name,
						ocrData: newOcrData,
					});

					toast.success(t("treasury.receipts.analysis_complete", "Analysis complete"), {
						id: toastId,
					});
				} else {
					throw new Error(result.error || "Analysis failed");
				}
			} catch (error) {
				console.error("Analysis failed:", error);
				const errorMessage =
					error instanceof Error && error.name === "AbortError"
						? t("treasury.receipts.analysis_timeout", "Analysis timed out")
						: t("treasury.receipts.analysis_failed", "Analysis failed");
				toast.error(errorMessage, { id: toastId });
			} finally {
				setIsAnalyzing(false);
			}
		},
		[enableAI, entityType, tempUrl, tempPathname, onNameSuggestion, onDescriptionSuggestion, saveDraft, t],
	);

	const handleFileChange = useCallback(
		async (file: File | null) => {
			setSelectedFile(file);
			setOcrData(null);

			if (!file) return;

			const config = FILE_TYPE_CONFIGS[entityType];
			const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
			
			if (!config.extensions.includes(ext as any)) {
				toast.error(
					t("files.invalid_type", {
						types: getAllowedExtensionsString(entityType),
						defaultValue: `Invalid file type. Allowed: ${getAllowedExtensionsString(entityType)}`,
					}),
				);
				return;
			}

			if (config.maxSizeMB && file.size > config.maxSizeMB * 1024 * 1024) {
				toast.error(
					t("files.too_large", {
						maxSize: config.maxSizeMB,
						defaultValue: `File size exceeds ${config.maxSizeMB}MB limit`,
					}),
				);
				return;
			}

			setIsUploading(true);
			const uploadToastId = toast.loading(t("files.uploading", "Uploading file..."));

			let uploadResult: any = null;

			try {
				if (entityType === "receipt") {
					const ingestFormData = new FormData();
					ingestFormData.append("file", file);
					ingestFormData.append(
						"analyzeWithAI",
						enableAI ? "true" : "false",
					);

					const ingestResponse = await fetch(
						`/api/receipts/${entityId}/ingest`,
						{
							method: "POST",
							body: ingestFormData,
						},
					);

					uploadResult = await ingestResponse.json();

					if (!(ingestResponse.ok && uploadResult.success)) {
						throw new Error(uploadResult?.error || "Upload failed");
					}

					setTempUrl(uploadResult.url || null);
					setTempPathname(uploadResult.pathname || null);

					const newOcrData = {
						rawText: uploadResult.rawText || "",
						parsedData: uploadResult.parsedData || {},
						suggestedName: uploadResult.suggestedName || "",
						suggestedDescription: uploadResult.suggestedDescription || "",
					};
					setOcrData(newOcrData);
					if (newOcrData.suggestedName && onNameSuggestion) {
						onNameSuggestion(newOcrData.suggestedName);
					}
					if (newOcrData.suggestedDescription && onDescriptionSuggestion) {
						onDescriptionSuggestion(newOcrData.suggestedDescription);
					}

					saveDraft({
						tempUrl: uploadResult.url,
						tempPathname: uploadResult.pathname,
						fileName: file.name,
						ocrData: uploadResult.rawText
							? {
									rawText: uploadResult.rawText || "",
									parsedData: uploadResult.parsedData || {},
									suggestedName: uploadResult.suggestedName || "",
									suggestedDescription:
										uploadResult.suggestedDescription || "",
							  }
							: undefined,
					});

					toast.success(t("files.upload_complete", "File uploaded"), {
						id: uploadToastId,
					});

					if (onUploadComplete) {
						onUploadComplete({
							url: uploadResult.url,
							pathname: uploadResult.pathname,
						});
					}

					if (uploadResult.error && enableAI) {
						toast.error(uploadResult.error);
					}

					return;
				}

				const uploadFormData = new FormData();
				uploadFormData.append("file", file);
				uploadFormData.append("entityType", entityType);
				if (year) uploadFormData.append("year", year);

				const uploadController = new AbortController();
				const uploadTimeoutId = setTimeout(() => uploadController.abort(), 30000);

				const uploadResponse = await fetch("/api/files/upload-temp", {
					method: "POST",
					body: uploadFormData,
					signal: uploadController.signal,
				});

				clearTimeout(uploadTimeoutId);

				uploadResult = await uploadResponse.json();

				if (uploadResponse.ok && uploadResult.success) {
					setTempUrl(uploadResult.url);
					setTempPathname(uploadResult.pathname);

					saveDraft({
						tempUrl: uploadResult.url,
						tempPathname: uploadResult.pathname,
						fileName: file.name,
						ocrData: undefined,
					});

					toast.success(t("files.upload_complete", "File uploaded"), {
						id: uploadToastId,
					});

					if (onUploadComplete) {
						onUploadComplete({ url: uploadResult.url, pathname: uploadResult.pathname });
					}

					if (enableAI) {
						await analyzeFile(file);
					}
				} else {
					throw new Error(uploadResult?.error || "Upload failed");
				}
			} catch (error) {
				console.error("File upload failed:", error);
				let errorMessage: string;
				if (error instanceof Error && error.name === "AbortError") {
					errorMessage = t("files.upload_timeout", "Upload timed out");
				} else if (uploadResult?.error === "invalid_file_type") {
					errorMessage = t("files.invalid_type", {
						types: uploadResult.allowedTypes || getAllowedExtensionsString(entityType),
						defaultValue: `Invalid file type. Allowed: ${uploadResult.allowedTypes || getAllowedExtensionsString(entityType)}`,
					});
				} else {
					errorMessage = t("files.upload_failed", "Upload failed");
				}
				toast.error(errorMessage, { id: uploadToastId });
			} finally {
				setIsUploading(false);
			}
		},
		[entityType, year, enableAI, analyzeFile, saveDraft, t, onUploadComplete],
	);

	const handleReanalyze = useCallback(async () => {
		if (selectedFile) {
			await analyzeFile(selectedFile);
		}
	}, [selectedFile, analyzeFile]);

	const handleCancel = useCallback(async () => {
			if (tempPathname && entityType !== "receipt") {
			const formData = new FormData();
			formData.append("pathname", tempPathname);
			formData.append("entityType", entityType);
			await fetch("/api/files/delete-temp", {
				method: "POST",
				body: formData,
			}).catch((err) => console.error("Failed to delete temp file:", err));
		}
		clearDraft();
		setTempUrl(null);
		setTempPathname(null);
		setSelectedFile(null);
		setOcrData(null);
	}, [tempPathname, entityType, clearDraft]);

	const clearFileState = useCallback(() => {
		setTempUrl(null);
		setTempPathname(null);
		setSelectedFile(null);
		setOcrData(null);
	}, []);

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
		clearFileState,
	};
}
