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
	isFocused?: boolean;
};

export function CommitteeMemberCard({
	member,
	noDescriptionLabel,
	isInfoReel = false,
	itemOpacity = 1,
	isFocused = false,
}: Props) {
	return (
		<div
			className={cn(
				// No overflow-hidden — allows avatar to pop out on hover
				"group relative flex",
				"flex-col sm:flex-row w-full sm:w-[670px] pt-6 sm:pt-8 gap-6 sm:gap-8 items-center sm:items-start text-center sm:text-left shrink-0 pl-4 sm:pl-6",
				// Adding hover/focus scaling effects:
				"transition-all duration-300 ease-out",
				// Regular view hover effects
				!isInfoReel && [
					"hover:scale-[1.03] hover:z-10",
					"group-hover/list:[&:not(:hover)]:scale-[0.97] group-hover/list:[&:not(:hover)]:opacity-60",
				],
				// Info Reel focus effects - exactly matches hover behavior
				isInfoReel && isFocused && "scale-[1.03] z-10",
				isInfoReel && !isFocused && "scale-[0.97] opacity-60",
			)}
		>
			<MemberAvatar
				name={member.name}
				picture={member.picture}
				roleColor={member.roles[0]?.color ?? "bg-primary"}
				isInfoReel={isInfoReel}
				isFocused={isFocused}
			/>

			{/* Content */}
			<div className="flex flex-col flex-1 sm:pt-[calc(148px/2.9)] w-full">
				<div className="flex flex-col gap-2 items-center sm:items-start w-full">
					<div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
						<h3 className="font-black text-xl md:text-2xl">
							{member.name}
						</h3>
						{member.roles.length > 0 && (
							<div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
								{member.roles.map((role) => (
									<span
										key={role.id}
										className={cn(
											"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm",
											role.color,
										)}
									>
										{role.name}
									</span>
								))}
							</div>
						)}
					</div>

					<div className="mt-2 w-full">
						{member.description ? (
							<p className="leading-relaxed text-muted-foreground whitespace-pre-wrap break-words text-sm md:text-base text-left">
								{member.description}
							</p>
						) : (
							<p className="text-sm text-muted-foreground/70 italic text-left">
								{noDescriptionLabel}
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
