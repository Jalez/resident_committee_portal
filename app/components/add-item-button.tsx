import { Form, Link } from "react-router";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";

const ADD_ICON_CLASS = "material-symbols-outlined";
/** Shared link style for both variants: same look as FAQ/news add button */
const ADD_LINK_CLASS =
	"inline-flex items-center text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors";
const ICON_SIZE = "text-xl";

export interface AddItemButtonProps {
	/** Target path (e.g. "/news/new"). If omitted, renders as a button. */
	to?: string;
	/** Tooltip / accessible label; also used as visible label when variant is "button" */
	title: string;
	/** Optional explicit label for button variant (defaults to title) */
	label?: React.ReactNode;
	/** "icon" = icon only; "button" = icon + label (same visual style, not a solid button) */
	variant?: "icon" | "button";
	/** Material symbol name (default "add") */
	icon?: string;
	className?: string;
	/** onClick handler (only used when to is undefined) */
	onClick?: () => void;
	/** Button type (submit, button, reset) - defaults to "button" if to is undefined */
	buttonType?: "button" | "submit" | "reset";
	/** If set, wraps the button in a Form POST to /api/entities/create-draft with this type value */
	createType?: string;
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
	onClick,
	buttonType = "button",
	createType,
}: AddItemButtonProps) {
	const displayLabel = label ?? title;
	const isIconOnly = variant === "icon";
	const classes = cn(
		ADD_LINK_CLASS,
		isIconOnly ? "p-2" : "px-3 py-2 gap-2",
		className,
	);
	const content = (
		<>
			<span className={cn(ADD_ICON_CLASS, ICON_SIZE)}>{icon}</span>
			{!isIconOnly && (
				<span className="text-sm font-medium">{displayLabel}</span>
			)}
		</>
	);

	if (to) {
		return (
			<Link
				to={to}
				className={classes}
				title={title}
				aria-label={title}
				onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>}
			>
				{content}
			</Link>
		);
	}

	if (createType) {
		return (
			<Form
				method="post"
				action="/api/entities/create-draft"
				className="contents"
			>
				<input type="hidden" name="type" value={createType} />
				<Button
					variant="ghost"
					type="submit"
					className={classes}
					title={title}
					aria-label={title}
					onClick={onClick}
				>
					{content}
				</Button>
			</Form>
		);
	}

	return (
		<Button
			type={buttonType}
			variant="ghost"
			className={classes}
			title={title}
			aria-label={title}
			onClick={onClick}
		>
			{content}
		</Button>
	);
}
