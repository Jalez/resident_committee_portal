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
	itemFillProgress?: number;
};

export function CommitteeMemberCard({
	member,
	noDescriptionLabel,
	isInfoReel = false,
	itemOpacity = 1,
	itemFillProgress = 0,
}: Props) {
	const cardStyle = isInfoReel ? { opacity: itemOpacity } : undefined;
	const avatarSizeClass = isInfoReel
		? "h-32 w-32 md:h-36 md:w-36"
		: "h-24 w-24 md:h-28 md:w-28";

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl bg-border/70 p-[2px] shadow-sm transition-all duration-200",
				"hover:shadow-md",
				isInfoReel ? "min-h-[320px]" : "min-h-[250px]",
			)}
			style={cardStyle}
		>
			{isInfoReel && (
				<div
					className="absolute inset-0 rounded-2xl bg-primary/40 pointer-events-none"
					style={{
						clipPath: `inset(0 ${100 - itemFillProgress}% 0 0)`,
					}}
				/>
			)}
			<div
				className={cn(
					"relative z-10 flex items-start gap-5 md:gap-6 rounded-[calc(var(--radius-2xl)-2px)] bg-card/90 p-6 backdrop-blur-sm",
					"border border-border/60",
				)}
			>
				{member.picture ? (
					<img
						src={member.picture}
						alt={member.name}
						className={cn(
							avatarSizeClass,
							"rounded-full object-cover shrink-0 ring-2 ring-primary/30",
						)}
					/>
				) : (
					<div
						className={cn(
							avatarSizeClass,
							"rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0",
						)}
					>
						<span className="text-3xl md:text-4xl font-black text-primary">
							{getInitials(member.name)}
						</span>
					</div>
				)}
				<div className="flex-1 min-w-0 flex flex-col">
					<h3 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
						{member.name}
					</h3>
					<div className="mt-3 flex flex-wrap gap-2">
						{member.roles.map((role) => (
							<span
								key={role.id}
								className={cn(
									"inline-flex items-center px-3 py-1.5 rounded-full text-xs md:text-sm font-semibold",
									role.color,
									"text-white shadow-sm",
								)}
							>
								{role.name}
							</span>
						))}
					</div>

					{member.description ? (
						<p className="mt-4 text-base md:text-lg leading-relaxed text-muted-foreground line-clamp-5">
							{member.description}
						</p>
					) : (
						<p className="mt-4 text-sm text-muted-foreground/80 italic">
							{noDescriptionLabel}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
