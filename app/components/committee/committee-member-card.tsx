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
};

export function CommitteeMemberCard({ member, noDescriptionLabel }: Props) {

	return (
		<div className="p-6 flex flex-col">
			{/* Profile Picture and Name */}
			<div className="flex items-center gap-4 mb-4">
				{member.picture ? (
					<img
						src={member.picture}
						alt={member.name}
						className="w-24 h-24 rounded-full object-cover shrink-0"
					/>
				) : (
					<div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
						<span className="text-2xl font-bold text-primary">
							{getInitials(member.name)}
						</span>
					</div>
				)}
				<div className="flex-1 min-w-0">
					<h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
						{member.name}
					</h3>
					<div className="mt-2 flex flex-wrap gap-2">
						{member.roles.map((role) => (
							<span
								key={role.id}
								className={cn(
									"inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
									role.color,
									"text-white",
								)}
							>
								{role.name}
							</span>
						))}
					</div>
				</div>
			</div>

			{/* Description */}
			{member.description ? (
				<p className="text-sm text-gray-600 dark:text-gray-300 mt-auto pt-4">
					{member.description}
				</p>
			) : (
				<p className="text-xs text-gray-400 dark:text-gray-500 mt-auto pt-4 italic">
					{noDescriptionLabel}
				</p>
			)}
		</div>
	);
}
