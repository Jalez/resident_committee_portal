import type { ReactNode } from "react";

interface PageHeaderProps {
	/** The title text to display */
	title: string;
	/** Optional action buttons rendered next to the title */
	actions?: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Reusable page header component with consistent styling.
 * Used for page titles across the application.
 */
export function PageHeader({
	title,
	actions,
	className = "",
}: PageHeaderProps) {
	return (
		<div className={`${className}`}>
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="min-w-0 flex-1 basis-[260px] text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
					{title}
				</h1>
				{actions && (
					<div className="basis-full sm:basis-auto sm:flex-none sm:ml-auto min-w-0 flex max-w-full items-center justify-end gap-3">
						{actions}
					</div>
				)}
			</div>
		</div>
	);
}
