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
export function PageHeader({ title, actions, className = "" }: PageHeaderProps) {
	return (
		<div className={`mb-8 ${className}`}>
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
					{title}
				</h1>
				{actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
			</div>
		</div>
	);
}
