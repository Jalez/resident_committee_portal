import { Link } from "react-router";
import { cn } from "~/lib/utils";

const ADD_ICON_CLASS = "material-symbols-outlined";
/** Shared link style for both variants: same look as FAQ/news add button */
const ADD_LINK_CLASS =
	"inline-flex items-center text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors";
const ICON_SIZE = "text-xl";

export interface AddItemButtonProps {
	/** Target path (e.g. "/news/new") */
	to: string;
	/** Tooltip / accessible label; also used as visible label when variant is "button" */
	title: string;
	/** Optional explicit label for button variant (defaults to title) */
	label?: React.ReactNode;
	/** "icon" = icon only; "button" = icon + label (same visual style, not a solid button) */
	variant?: "icon" | "button";
	/** Material symbol name (default "add") */
	icon?: string;
	className?: string;
}

/**
 * Reusable "add item" control used across list pages for consistency.
 * Same look everywhere: muted link style (FAQ/news). Use "icon" in tight headers, "button" when label helps (e.g. empty states).
 */
export function AddItemButton({
	to,
	title,
	label,
	variant = "button",
	icon = "add",
	className,
}: AddItemButtonProps) {
	const displayLabel = label ?? title;
	const isIconOnly = variant === "icon";

	return (
		<Link
			to={to}
			className={cn(
				ADD_LINK_CLASS,
				isIconOnly ? "p-2" : "px-3 py-2 gap-2",
				className,
			)}
			title={title}
			aria-label={title}
		>
			<span className={cn(ADD_ICON_CLASS, ICON_SIZE)}>{icon}</span>
			{!isIconOnly && (
				<span className="text-sm font-medium">{displayLabel}</span>
			)}
		</Link>
	);
}
