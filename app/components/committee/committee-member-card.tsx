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

// "bg-red-500" → "red-500", "bg-primary" → "primary"
function getRoleColorName(colorClass: string): string {
	const match = colorClass.match(/^bg-(.+)$/);
	return match ? match[1] : "primary";
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
	const initialsTextClass = isInfoReel
		? "text-4xl md:text-5xl"
		: "text-3xl md:text-4xl";

	const roleColorName = member.roles[0]
		? getRoleColorName(member.roles[0].color)
		: "primary";

	// --c: ring/border color  --cb: fill background (tinted with role color)
	const avatarVars = {
		"--c": `var(--color-${roleColorName})`,
		"--cb": `color-mix(in oklch, var(--color-${roleColorName}) 18%, var(--card))`,
	} as React.CSSProperties;

	return (
		<div
			className={cn(
				// No overflow-hidden — allows avatar to pop out on hover
				"group relative flex flex-col rounded-3xl p-[1.5px]",
				"bg-gradient-to-br from-primary/30 via-border/60 to-border/20",
				"shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5",
				isInfoReel ? "min-h-[320px]" : "min-h-[250px]",
			)}
			style={cardStyle}
		>
			{/* Info reel progress bar — behind inner card (z-10), visible only through the 1.5px border gap */}
			{isInfoReel && (
				<div
					className="absolute inset-0 rounded-3xl bg-primary/50 pointer-events-none"
					style={{
						clipPath: `inset(0 ${100 - itemFillProgress}% 0 0)`,
					}}
				/>
			)}

			{/* Inner card */}
			<div
				className={cn(
					"relative z-10 flex-1 flex flex-col items-center text-center",
					"rounded-[calc(var(--radius-3xl)-2px)] bg-card/95 backdrop-blur-sm",
					"border border-border/40 pt-3 pb-6 px-6",
				)}
			>
				{/* Subtle primary tint at the top */}
				<div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/5 to-transparent rounded-t-[calc(var(--radius-3xl)-2px)] pointer-events-none" />

				{/* Avatar — uses shape effect, pops out of card on hover */}
				<div className="relative z-10 shrink-0">
					{member.picture ? (
						<img
							src={member.picture}
							alt={member.name}
							className={cn(
								"avatar-effect",
								isInfoReel && "avatar-effect--reel",
							)}
							style={avatarVars}
						/>
					) : (
						<div
							className={cn(
								"avatar-effect relative",
								isInfoReel && "avatar-effect--reel",
							)}
							style={avatarVars}
						>
							{/* Centered in the circular masked area */}
							<span
								className={cn(
									"absolute inset-0 flex items-center justify-center font-black text-primary",
									initialsTextClass,
								)}
								style={{ paddingTop: "20%" }}
							>
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

				{/* Divider + description */}
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
