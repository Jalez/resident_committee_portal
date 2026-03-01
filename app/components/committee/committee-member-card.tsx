import { cn } from "~/lib/utils";
import { MemberAvatar } from "./member-avatar";

export type CommitteeMemberCardMember = {
	id: string;
	name: string;
	description: string | null;
	picture: string | null;
	roles: { id: string; name: string; color: string }[];
};

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

	return (
		<div
			className={cn(
				// No overflow-hidden — allows avatar to pop out on hover
				"group",
				isInfoReel
					? "relative flex flex-col min-h-[320px] rounded-3xl p-[1.5px] bg-gradient-to-br from-primary/30 via-border/60 to-border/20 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
					: "contents",
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
					"relative z-10 flex-1 flex",
					isInfoReel
						? "flex-col items-center rounded-[calc(var(--radius-3xl)-2px)] bg-card/95 backdrop-blur-sm border border-border/40 pt-3 pb-6 px-6"
						: "h-[210px] md:h-[246px] w-full max-w-[670px] mx-auto flex-col items-center sm:flex-row sm:items-start gap-4 sm:gap-6 rounded-none bg-transparent border-0 px-3 py-2",
				)}
			>
				{/* Subtle primary tint at the top */}
				{isInfoReel && (
					<div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/5 to-transparent rounded-t-[calc(var(--radius-3xl)-2px)] pointer-events-none" />
				)}

				<MemberAvatar
					name={member.name}
					picture={member.picture}
					roleColor={member.roles[0]?.color ?? "bg-primary"}
					isInfoReel={isInfoReel}
				/>

				{/* Name & roles */}
				<div
					className={cn(
						"relative z-10 flex flex-col gap-2 pt-15",
						isInfoReel
							? "items-center w-full mt-4"
							: "items-center sm:items-start w-full sm:self-stretch",
					)}
				>
					<div
						className={cn(
							"w-full",
							isInfoReel
								? "flex items-center gap-2"
								: "flex items-center gap-3 flex-wrap justify-center sm:justify-start",
						)}
					>
						<h3
							className={cn(
								"font-black",
								isInfoReel ? "text-2xl md:text-3xl" : "text-xl md:text-2xl",
							)}
						>
							{member.name}
						</h3>
						{member.roles.length > 0 && (
							<div
								className={cn(
									"flex flex-wrap gap-1.5",
									isInfoReel ? "justify-center" : "justify-end sm:justify-start",
								)}
							>
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

					{!isInfoReel && (
						<div className="flex-1 min-h-0 overflow-y-auto w-full pr-1">
							{member.description ? (
								<p className="text-sm md:text-base leading-relaxed text-muted-foreground sm:text-left whitespace-pre-wrap break-words">
									{member.description}
								</p>
							) : (
								<p className="text-sm text-muted-foreground/70 italic sm:text-left">
									{noDescriptionLabel}
								</p>
							)}
						</div>
					)}
				</div>

				{/* Divider + description */}
				{isInfoReel && (
					<div className="relative z-10 flex-1 flex flex-col w-full mt-4">
						<div className="border-t border-border/50" />
						{member.description ? (
							<p className="mt-4 text-base md:text-lg leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
								{member.description}
							</p>
						) : (
							<p className="mt-4 text-sm text-muted-foreground/70 italic">
								{noDescriptionLabel}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
