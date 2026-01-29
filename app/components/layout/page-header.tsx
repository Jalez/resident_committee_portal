interface PageHeaderProps {
	/** The title text to display */
	title: string;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Reusable page header component with consistent styling.
 * Used for page titles across the application.
 */
export function PageHeader({ title, className = "" }: PageHeaderProps) {
	return (
		<div className={`mb-8 ${className}`}>
			<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
				{title}
			</h1>
		</div>
	);
}
