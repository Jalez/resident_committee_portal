import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export interface RelationIconBadgeProps {
	href: string;
	icon: string;
	statusVariant: string;
	tooltipTitleKey: string;
	tooltipSubtitle: string;
	className?: string;
}

export function RelationIconBadge({
	href,
	icon,
	statusVariant,
	tooltipTitleKey,
	tooltipSubtitle,
	className,
}: RelationIconBadgeProps) {
	const { t } = useTranslation();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					to={href}
					className={cn(
						"w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80",
						statusVariant,
						className,
					)}
				>
					<span className="material-symbols-outlined text-lg">{icon}</span>
				</Link>
			</TooltipTrigger>
			<TooltipContent side="top">
				<div className="font-medium">{t(tooltipTitleKey)}</div>
				<div className="opacity-70 text-xs truncate max-w-[200px]">
					{tooltipSubtitle}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
