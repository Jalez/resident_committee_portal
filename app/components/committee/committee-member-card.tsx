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
	const initialsTextClass = isInfoReel
		? "text-4xl md:text-5xl"
		: "text-3xl md:text-4xl";

	return (
		<div
			className={cn(
				// Outer: gradient border wrapper — flex-col so inner can flex-1 to fill it
				"group relative flex flex-col overflow-hidden rounded-3xl p-[1.5px]",
				"bg-gradient-to-br from-primary/30 via-border/60 to-border/20",
				"shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5",
				isInfoReel ? "min-h-[320px]" : "min-h-[250px]",
			)}
			style={cardStyle}
		>
			{/* Info reel progress bar overlay */}
			{isInfoReel && (
				<div
					className="absolute inset-0 rounded-3xl bg-primary/25 pointer-events-none z-20"
					style={{
						clipPath: `inset(0 ${100 - itemFillProgress}% 0 0)`,
					}}
				/>
			)}

			{/* Inner card — flex-1 makes it fill the outer wrapper completely (bug fix) */}
			<div
				className={cn(
					"relative z-10 flex-1 flex flex-col items-center text-center",
					"rounded-[calc(var(--radius-3xl)-2px)] bg-card/95 backdrop-blur-sm",
					"border border-border/40 p-6",
				)}
			>
				{/* Subtle primary tint at the top of the card */}
				<div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/5 to-transparent rounded-t-[calc(var(--radius-3xl)-2px)] pointer-events-none" />

				{/* Avatar */}
				<div className="relative z-10 shrink-0 mt-2">
					{member.picture ? (
						<div className="relative">
							{/* Soft glow behind avatar */}
							<div
								className={cn(
									avatarSizeClass,
									"absolute inset-0 rounded-full bg-primary/20 blur-lg scale-125",
									"opacity-50 group-hover:opacity-75 transition-opacity duration-300",
								)}
							/>
							<img
								src={member.picture}
								alt={member.name}
								className={cn(
									avatarSizeClass,
									"relative rounded-full object-cover shadow-md",
									"ring-2 ring-primary/35 group-hover:ring-primary/65",
									"transition-all duration-300",
								)}
							/>
						</div>
					) : (
						<div
							className={cn(
								avatarSizeClass,
								"relative rounded-full bg-primary/10 border-2 border-primary/25",
								"flex items-center justify-center shadow-md",
								"group-hover:border-primary/55 transition-all duration-300",
							)}
						>
							<span className={cn(initialsTextClass, "font-black text-primary")}>
								{getInitials(member.name)}
							</span>
						</div>
					)}
				</div>

				{/* Name & roles */}
				<div className="relative z-10 flex flex-col items-center gap-2 w-full mt-4">
					<h3
						className={cn(
							"font-black tracking-tight leading-tight",
							isInfoReel ? "text-2xl md:text-3xl" : "text-xl md:text-2xl",
						)}
					>
						{member.name}
					</h3>
					{member.roles.length > 0 && (
						<div className="flex flex-wrap gap-1.5 justify-center">
							{member.roles.map((role) => (
								<span
									key={role.id}
									className={cn(
										"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
										role.color,
										"text-white shadow-sm",
									)}
								>
									{role.name}
								</span>
							))}
						</div>
					)}
				</div>

				{/* Divider + description — flex-1 pushes it down to fill remaining height */}
				<div className="relative z-10 flex-1 flex flex-col w-full mt-4">
					<div className="border-t border-border/50" />
					{member.description ? (
						<p
							className={cn(
								"mt-4 text-left leading-relaxed text-muted-foreground",
								isInfoReel
									? "text-base md:text-lg line-clamp-6"
									: "text-sm md:text-base line-clamp-5",
							)}
						>
							{member.description}
						</p>
					) : (
						<p className="mt-4 text-sm text-muted-foreground/70 italic">
							{noDescriptionLabel}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
