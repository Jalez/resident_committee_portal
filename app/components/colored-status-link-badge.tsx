import { Badge } from "~/components/ui/badge";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Check } from "lucide-react";

export const TREASURY_PURCHASE_STATUS_VARIANTS: Record<string, string> = {
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
	approved:
		"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	reimbursed:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
	rejected:
		"bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export const TREASURY_TRANSACTION_STATUS_VARIANTS: Record<string, string> = {
	complete:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
	paused: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const TREASURY_TRANSACTION_TYPE_VARIANTS: Record<string, string> = {
	income:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const TREASURY_BUDGET_STATUS_VARIANTS: Record<string, string> = {
	open: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
	closed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export const TREASURY_RELATION_STATUS_VARIANTS: Record<string, string> = {
	...TREASURY_PURCHASE_STATUS_VARIANTS,
	...TREASURY_TRANSACTION_STATUS_VARIANTS,
	...TREASURY_BUDGET_STATUS_VARIANTS,
	unsaved:
		"border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground hover:bg-muted/10",
};

type ColoredStatusLinkProps = {
	to: string;
	title: string;
	id: string;
	status?: string;
	description?: string | null;
	subtitle?: string | null;
	icon?: string;
	variantMap?: Record<string, string>;
	className?: string;
	mode?: "view" | "edit";
	onRemove?: (id: string) => void;
	onCheck?: (checked: boolean) => void;
	checked?: boolean;
};

export function ColoredStatusLinkBadge({
	to,
	title,
	status,
	id,
	description,
	subtitle,
	icon,
	variantMap = TREASURY_PURCHASE_STATUS_VARIANTS,
	className,
	mode,
	onRemove,
	onCheck,
	checked,
}: ColoredStatusLinkProps) {
	const { t } = useTranslation();
	const statusVariant =
		status && (variantMap[status] || variantMap.pending || "bg-gray-100 text-gray-800");
	const extraClass = className ? ` ${className}` : "";

	// Wrapper component to handle conditional linking - unused now, logic moved to main return
	// const Wrapper = ...

	return (
		<Badge
			variant="outline"
			className={cn(
				"inline-flex items-center gap-1 hover:underline text-sm font-medium border-0 px-2 py-1 h-8 cursor-pointer select-none",
				statusVariant,
				className,
				onCheck && "cursor-pointer select-none"
			)}
			onClick={(e) => {
				if (onCheck) {
					e.preventDefault();
					onCheck(!checked);
				}
			}}
		>
			<Link
				to={to}
				title={title}
				onClick={(e) => e.stopPropagation()}
				className="flex items-center gap-1"
			>
				{icon ? (
					<span className="material-symbols-outlined text-base">
						{icon}
					</span>
				) : null}
				{title || id.slice(0, 8)}
			</Link>

			{subtitle && (
				<span className="text-[10px] font-normal opacity-70 truncate max-w-[140px]" title={subtitle}>
					{subtitle}
				</span>
			)}

			{mode === "edit" && onRemove && !onCheck && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={(e) => {
						e.stopPropagation();
						onRemove(id);
					}}
					className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-transparent"
					title={t("common.actions.remove")}
					aria-label={t("common.actions.remove")}
					aria-describedby={id}
				>
					<span className="material-symbols-outlined text-base">
						delete
					</span>
				</Button>
			)}

			{onCheck && (
				<div
					className={cn(
						"ml-2 flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border ring-offset-background transition-colors",
						checked
							? "bg-primary border-primary text-primary-foreground"
							: "border-input bg-background/50"
					)}
				>
					{checked && <Check className="h-3 w-3" strokeWidth={3} />}
				</div>
			)}
		</Badge>
	);
}
