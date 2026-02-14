import { cn } from "~/lib/utils";

export interface EmptyStateProps {
	message: string;
	description?: string;
	icon?: string;
	action?: React.ReactNode;
	className?: string;
}

export function EmptyState({
	message,
	description,
	icon,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"rounded-xl border border-border bg-card p-8 text-center",
				className,
			)}
		>
			{icon && (
				<span className="material-symbols-outlined text-4xl text-muted-foreground mb-2 block">
					{icon}
				</span>
			)}
			<p
				className={cn(
					icon
						? "text-xl font-bold text-muted-foreground mb-2"
						: "text-muted-foreground",
				)}
			>
				{message}
			</p>
			{description && (
				<p className="text-muted-foreground/70 mb-4">{description}</p>
			)}
			{action}
		</div>
	);
}
