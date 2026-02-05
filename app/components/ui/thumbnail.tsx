import { useState } from "react";
import { cn } from "~/lib/utils";

export interface ThumbnailProps {
	/** Image URL (e.g. blob URL, thumbnail API URL) */
	src: string;
	/** Alt text for accessibility */
	alt: string;
	/** How the image fits in its container. `contain` keeps full image visible; `cover` fills and may crop. */
	objectFit?: "contain" | "cover";
	/** Additional className for the img element */
	imgClassName?: string;
}

/**
 * Displays an image thumbnail with loading and error states.
 * Expects a relative container parent (e.g. with aspect-ratio).
 */
export function Thumbnail({
	src,
	alt,
	objectFit = "contain",
	imgClassName,
}: ThumbnailProps) {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);

	const fitClasses =
		objectFit === "cover"
			? "w-full h-full object-cover"
			: "max-h-full max-w-full object-contain";

	return (
		<>
			{isLoading && !hasError && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
					<span className="material-symbols-outlined animate-spin text-2xl text-muted-foreground">
						progress_activity
					</span>
				</div>
			)}
			<img
				src={src}
				alt={alt}
				className={cn(
					fitClasses,
					"transition-opacity duration-200 rounded-md",
					isLoading ? "opacity-0" : "opacity-100",
					imgClassName,
				)}
				onLoad={() => setIsLoading(false)}
				onError={() => {
					setIsLoading(false);
					setHasError(true);
				}}
			/>
			{hasError && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
					<span className="material-symbols-outlined text-2xl text-muted-foreground">
						broken_image
					</span>
				</div>
			)}
		</>
	);
}
