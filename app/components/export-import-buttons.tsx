import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const exportLinkClassName =
	"p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors";
const importButtonClassName =
	"p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";

export interface ExportLinkProps {
	href: string;
	download?: string;
	title?: string;
	className?: string;
}

/**
 * Link that triggers a CSV/file download. Use for export actions.
 */
export function ExportLink({
	href,
	download,
	title,
	className = exportLinkClassName,
}: ExportLinkProps) {
	return (
		<a
			href={href}
			download={download}
			className={className}
			title={title}
		>
			<span className="material-symbols-outlined text-xl">download</span>
		</a>
	);
}

export interface ExportButtonProps {
	href: string;
	download?: string;
	title?: string;
	className?: string;
}

/**
 * Button that fetches the export URL and triggers download. Shows toast on error (e.g. 404, API route not found).
 */
export function ExportButton({
	href,
	download: downloadFilename,
	title,
	className = exportLinkClassName,
}: ExportButtonProps) {
	const { t } = useTranslation();
	const [isExporting, setIsExporting] = useState(false);

	const handleClick = async () => {
		setIsExporting(true);
		try {
			const response = await fetch(href);
			if (!response.ok) {
				toast.error(
					t("treasury.breakdown.export_error", "Export not available"),
				);
				return;
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download =
				downloadFilename ||
				response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ||
				"export.csv";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (_err) {
			toast.error(
				t("treasury.breakdown.export_error", "Export not available"),
			);
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className={className}
			title={title ?? t("treasury.breakdown.export")}
			disabled={isExporting}
		>
			{isExporting ? (
				<span className="material-symbols-outlined text-xl animate-spin">
					progress_activity
				</span>
			) : (
				<span className="material-symbols-outlined text-xl">download</span>
			)}
		</button>
	);
}

export interface ImportButtonProps {
	actionUrl: string;
	extraFields?: Record<string, string>;
	title?: string;
	className?: string;
}

/**
 * Button that opens a file picker and POSTs the file (and optional extra fields) to the given action URL.
 * On success: toast and reload. On failure: toast error.
 */
export function ImportButton({
	actionUrl,
	extraFields,
	title,
	className = importButtonClassName,
}: ImportButtonProps) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setIsImporting(true);

		const formData = new FormData();
		formData.append("file", file);
		if (extraFields) {
			for (const [key, value] of Object.entries(extraFields)) {
				formData.append(key, value);
			}
		}

		try {
			const response = await fetch(actionUrl, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				toast.error(
					t("treasury.breakdown.import_error", "Import not available"),
				);
				return;
			}

			let result: { success?: boolean; imported?: number; error?: string };
			try {
				result = await response.json();
			} catch {
				toast.error(
					t("treasury.breakdown.import_error", "Import not available"),
				);
				return;
			}

			if (result.success) {
				toast.success(
					t("treasury.breakdown.import_success", { count: result.imported }),
				);
				window.location.reload();
			} else {
				toast.error(result.error || t("treasury.breakdown.import_error"));
			}
		} catch (_error) {
			toast.error(t("treasury.breakdown.import_error"));
		} finally {
			setIsImporting(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv,.xlsx,.xls"
				className="hidden"
				onChange={handleFileChange}
			/>
			<button
				type="button"
				onClick={() => fileInputRef.current?.click()}
				className={className}
				title={title ?? t("treasury.breakdown.import")}
				disabled={isImporting}
			>
				{isImporting ? (
					<span className="material-symbols-outlined text-xl animate-spin">
						progress_activity
					</span>
				) : (
					<span className="material-symbols-outlined text-xl">upload</span>
				)}
			</button>
		</>
	);
}
