import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface FileUploadProps {
	/** Input name attribute */
	name: string;
	/** Input id attribute */
	id?: string;
	/** Accepted file types (e.g., [".pdf", ".jpg"]) */
	accept?: readonly string[] | string[];
	/** Whether the field is required */
	required?: boolean;
	/** Label text */
	label?: string;
	/** Helper text shown below the upload area */
	helperText?: string;
	/** Callback when file changes */
	onFileChange?: (file: File | null) => void;
	/** Translation keys for drag/drop text */
	dragDropKey?: string;
	dropFileKey?: string;
	/** Additional className for the container */
	className?: string;
}

export function FileUpload({
	name,
	id,
	accept = [],
	required = false,
	label,
	helperText,
	onFileChange,
	dragDropKey = "common.file_upload.drag_drop",
	dropFileKey = "common.file_upload.drop_file",
	className,
}: FileUploadProps) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const validateFileType = (file: File): boolean => {
		if (accept.length === 0) return true;
		const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
		return accept.includes(ext);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const files = e.dataTransfer.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (validateFileType(file)) {
				setSelectedFile(file);
				onFileChange?.(file);
				// Create a DataTransfer object to set the file
				const dataTransfer = new DataTransfer();
				dataTransfer.items.add(file);
				if (fileInputRef.current) {
					fileInputRef.current.files = dataTransfer.files;
					// Trigger change event
					fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
				}
			}
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (validateFileType(file)) {
				setSelectedFile(file);
				onFileChange?.(file);
			}
		} else {
			setSelectedFile(null);
			onFileChange?.(null);
		}
	};

	const handleRemove = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setSelectedFile(null);
		onFileChange?.(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className={cn("space-y-2", className)}>
			{label && (
				<label htmlFor={id || name} className="text-sm font-medium">
					{label} {required && "*"}
				</label>
			)}
			<div
				onDragEnter={handleDragEnter}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={cn(
					"relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
					isDragging
						? "border-primary bg-primary/5 dark:bg-primary/10"
						: "border-muted-foreground/25 hover:border-muted-foreground/50",
				)}
			>
				<input
					ref={fileInputRef}
					id={id || name}
					name={name}
					type="file"
					accept={accept.join(",")}
					required={required}
					onChange={handleFileChange}
					className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
				/>
				<div className="flex flex-col items-center gap-2">
					{selectedFile ? (
						<>
							<span className="material-symbols-outlined text-4xl text-primary">
								description
							</span>
							<div className="text-sm font-medium text-center">
								{selectedFile.name}
							</div>
							<p className="text-xs text-muted-foreground">
								{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleRemove}
								className="mt-2"
							>
								{t("common.actions.remove")}
							</Button>
						</>
					) : (
						<>
							<span className="material-symbols-outlined text-4xl text-muted-foreground">
								{isDragging ? "cloud_upload" : "upload_file"}
							</span>
							<div className="text-sm font-medium">
								{isDragging ? t(dropFileKey) : t(dragDropKey)}
							</div>
							{helperText && (
								<p className="text-xs text-muted-foreground">{helperText}</p>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
