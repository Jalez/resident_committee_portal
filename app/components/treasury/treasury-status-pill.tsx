import { cn } from "~/lib/utils";

const BASE_CLASSES =
	"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";

interface TreasuryStatusPillProps {
	/** The status value used to look up color classes */
	value: string;
	/** Map of status value to Tailwind color classes */
	variantMap: Record<string, string>;
	/** Display label (e.g. from t()) */
	label: string;
	/** Optional: render custom content instead of label */
	children?: React.ReactNode;
	className?: string;
}

export function TreasuryStatusPill({
	value,
	variantMap,
	label,
	children,
	className,
}: TreasuryStatusPillProps) {
	const colorClasses =
		variantMap[value] ??
		"bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
	return (
		<span className={cn(BASE_CLASSES, colorClasses, className)} title={label}>
			{children ?? label}
		</span>
	);
}
