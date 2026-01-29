import type { ReactNode } from "react";

interface SectionCardProps {
	/** Content to display inside the card */
	children: ReactNode;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Reusable section card component with consistent styling.
 * Used to wrap sections like reimbursement options, transaction details, etc.
 */
export function SectionCard({ children, className = "" }: SectionCardProps) {
	return (
		<div
			className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4 ${className}`}
		>
			{children}
		</div>
	);
}
