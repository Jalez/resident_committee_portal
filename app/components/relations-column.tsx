import type { RelationBadgeData } from "~/lib/relations-column.server";
import { RelationIconBadge } from "./relation-icon-badge";

export interface RelationsColumnProps {
	relations: RelationBadgeData[];
}

export function RelationsColumn({ relations }: RelationsColumnProps) {
	if (relations.length === 0) {
		return <span className="text-gray-400">—</span>;
	}

	return (
		<div className="flex flex-wrap gap-1 justify-center min-w-[100px]">
			{relations.map((rel) => (
				<RelationIconBadge
					key={`${rel.type}-${rel.id}`}
					href={rel.href}
					icon={rel.icon}
					statusVariant={rel.statusVariant}
					tooltipTitleKey={rel.tooltipTitleKey}
					tooltipSubtitle={rel.tooltipSubtitle}
				/>
			))}
		</div>
	);
}
