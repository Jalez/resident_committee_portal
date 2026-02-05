import { useRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

const ADD_ICON_CLASS = "material-symbols-outlined";
/** Shared button style for both variants: same look as AddItemButton */
const ADD_BUTTON_CLASS =
	"inline-flex items-center text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const ICON_SIZE = "text-xl";

export interface AddFileButtonProps {
	/** Callback when file is selected */
	onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	/** Tooltip / accessible label; also used as visible label when variant is "button" */
	title: string;
	/** Optional explicit label for button variant (defaults to title) */
	label?: ReactNode;
	/** "icon" = icon only; "button" = icon + label (same visual style, not a solid button) */
	variant?: "icon" | "button";
	/** Material symbol name (default "add") */
	icon?: string;
	/** Whether upload is in progress (shows spinner) */
	isUploading?: boolean;
	/** File input accept attribute (e.g., "image/*", ".pdf,.doc") */
	accept?: string;
	/** Whether the button is disabled */
	disabled?: boolean;
	/** Optional className */
	className?: string;
	/** Optional ref to file input (for sharing between multiple buttons) */
	fileInputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Reusable "add file" button that triggers a file input, used for uploads.
 * Matches AddItemButton styling for consistency. Use "icon" in tight headers, "button" when label helps.
 */
export function AddFileButton({
	onFileChange,
	title,
	label,
	variant = "icon",
	icon = "add",
	isUploading = false,
	accept,
	disabled = false,
	className,
	fileInputRef: externalFileInputRef,
}: AddFileButtonProps) {
	const internalFileInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = externalFileInputRef ?? internalFileInputRef;
	const displayLabel = label ?? title;
	const isIconOnly = variant === "icon";
	const displayIcon = isUploading ? "progress_activity" : icon;

	const handleClick = () => {
		if (!disabled && !isUploading) {
			fileInputRef.current?.click();
		}
	};

	return (
		<>
			{!externalFileInputRef && (
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					accept={accept}
					onChange={onFileChange}
					disabled={disabled || isUploading}
				/>
			)}
			<button
				type="button"
				onClick={handleClick}
				disabled={disabled || isUploading}
				className={cn(
					ADD_BUTTON_CLASS,
					isIconOnly ? "p-2" : "px-3 py-2 gap-2",
					className,
				)}
				title={title}
				aria-label={title}
			>
				<span
					className={cn(
						ADD_ICON_CLASS,
						ICON_SIZE,
						isUploading && "animate-spin",
					)}
				>
					{displayIcon}
				</span>
				{!isIconOnly && (
					<span className="text-sm font-medium">{displayLabel}</span>
				)}
			</button>
		</>
	);
}
