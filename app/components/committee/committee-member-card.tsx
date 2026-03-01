import { cn } from "~/lib/utils";

export type CommitteeMemberCardMember = {
	id: string;
	name: string;
	description: string | null;
	picture: string | null;
	roles: { id: string; name: string; color: string }[];
};

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
	return (parts[0][0] || "") + (parts[parts.length - 1][0] || "");
}

type Props = {
	member: CommitteeMemberCardMember;
	noDescriptionLabel: string;
	isInfoReel?: boolean;
	itemOpacity?: number;
	index?: number;
};

export function CommitteeMemberCard({
	member,
	noDescriptionLabel,
	isInfoReel = false,
	itemOpacity = 1,
	index = 0,
}: Props) {
	const cardStyle = isInfoReel
		? {
				opacity: itemOpacity,
				transform: `translateY(${(1 - itemOpacity) * 10 + index * 2}px)`,
			}
		: undefined;

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 backdrop-blur-sm p-5 flex flex-col shadow-sm transition-all duration-200",
				"hover:shadow-md hover:border-primary/30",
				isInfoReel && "min-h-[220px]",
			)}
			style={cardStyle}
		>
			<div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />

			<div className="relative flex items-start gap-4 mb-4">
				{member.picture ? (
					<img
						src={member.picture}
						alt={member.name}
						className="w-16 h-16 rounded-2xl object-cover shrink-0 ring-2 ring-primary/20"
					/>
				) : (
					<div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
						<span className="text-xl font-black text-primary">
							{getInitials(member.name)}
						</span>
					</div>
				)}
				<div className="flex-1 min-w-0">
					<h3 className="text-lg font-black tracking-tight text-foreground truncate">
						{member.name}
					</h3>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{member.roles.map((role) => (
							<span
								key={role.id}
								className={cn(
									"inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold",
									role.color,
									"text-white shadow-sm",
								)}
							>
								{role.name}
							</span>
						))}
					</div>
				</div>
			</div>

			{member.description ? (
				<p className="relative text-sm text-muted-foreground mt-auto pt-3 leading-relaxed line-clamp-5">
					{member.description}
				</p>
			) : (
				<p className="relative text-xs text-muted-foreground/70 mt-auto pt-3 italic">
					{noDescriptionLabel}
				</p>
			)}
		</div>
	);
}
