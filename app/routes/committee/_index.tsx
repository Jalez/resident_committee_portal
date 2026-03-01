import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommitteeMemberCard } from "~/components/committee/committee-member-card";
import {
	ContentArea,
	PageWrapper,
	SplitLayout,
} from "~/components/layout/page-layout";
import { useLocalReel, useInfoReel } from "~/contexts/info-reel-context";

const DURATION_PER_MEMBER = 4000; // 6 seconds per member in info reel
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

type CommitteeMember = {
	id: string;
	name: string;
	email: string;
	description: string | null;
	picture: string | null;
	roles: { id: string; name: string; color: string }[];
};

type CommitteeLoaderData = {
	siteConfig: typeof SITE_CONFIG;
	members: CommitteeMember[];
	systemLanguages: { primary: string; secondary: string | null };
};

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.siteConfig?.name || "Committee"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:read", getDatabase);

	const db = getDatabase();

	// Get "Board Member" role
	const boardMemberRole = await db.getRoleByName("Board Member");
	if (!boardMemberRole) {
		const systemLanguages = await getSystemLanguageDefaults();
		return {
			siteConfig: SITE_CONFIG,
			members: [],
			systemLanguages,
		};
	}

	// Get all users with "Board Member" role
	const committeeUsers = await db.getUsersByRoleId(boardMemberRole.id);

	// Get all roles for color/name lookup
	const allRoles = await db.getAllRoles();
	const roleMap = new Map(allRoles.map((r) => [r.id, r]));

	// Get all user roles
	const allUserRoles = await db.getAllUserRoles();
	const rolesByUser = new Map<string, string[]>();
	for (const ur of allUserRoles) {
		const list = rolesByUser.get(ur.userId) ?? [];
		list.push(ur.roleId);
		rolesByUser.set(ur.userId, list);
	}

	// Build committee members list
	const members: CommitteeMember[] = [];
	for (const user of committeeUsers) {
		const userRoleIds = rolesByUser.get(user.id) || [];
		const roles = userRoleIds
			.map((roleId) => {
				const role = roleMap.get(roleId);
				if (!role) return null;
				return {
					id: role.id,
					name: role.name,
					color: role.color,
				};
			})
			.filter(
				(r): r is { id: string; name: string; color: string } => r !== null,
			);

		members.push({
			id: user.id,
			name: user.name,
			email: user.email,
			description: user.description || null,
			picture: user.picture || null,
			roles,
		});
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		members,
		systemLanguages,
	};
}

export default function Committee({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const { members: rawMembers, systemLanguages } = loaderData as CommitteeLoaderData;
	// Show members with avatar pictures first
	const members = useMemo(() =>
		[...rawMembers].sort((a, b) => (b.picture ? 1 : 0) - (a.picture ? 1 : 0)),
		[rawMembers],
	);
	const [membersPerPage, setMembersPerPage] = useState(1);
	const { setDurationOverride } = useInfoReel();

	// Dynamically set info reel duration based on member count
	useEffect(() => {
		if (members.length > 0) {
			setDurationOverride(members.length * DURATION_PER_MEMBER);
		}
		return () => setDurationOverride(null);
	}, [members.length, setDurationOverride]);

	useEffect(() => {
		const computeMembersPerPage = () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			if (width >= 1400 && height >= 750) return 2;
			return 1;
		};

		const update = () => setMembersPerPage(computeMembersPerPage());
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);

	const memberGroups = useMemo(() => {
		if (members.length === 0) return [[] as CommitteeMember[]];
		const groups: CommitteeMember[][] = [];
		for (let i = 0; i < members.length; i += membersPerPage) {
			groups.push(members.slice(i, i + membersPerPage));
		}
		return groups;
	}, [members, membersPerPage]);

	const {
		isInfoReel,
		activeIndex,
		activeItem,
		itemOpacity,
		itemDuration,
	} = useLocalReel({
		items: memberGroups,
	});
	const visibleMembers = activeItem ?? [];

	const [focusedMemberIndex, setFocusedMemberIndex] = useState(0);

	useEffect(() => {
		if (!isInfoReel || visibleMembers.length <= 1) {
			setFocusedMemberIndex(0);
			return;
		}
		// Cycle focus between visible members equally over the group's duration
		const interval = setInterval(() => {
			setFocusedMemberIndex((prev) => (prev + 1) % visibleMembers.length);
		}, itemDuration / visibleMembers.length);

		return () => clearInterval(interval);
	}, [isInfoReel, activeIndex, visibleMembers.length, itemDuration]);

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("committee.title", { lng: systemLanguages.primary }),
					secondary: t("committee.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
			>
				<ContentArea>
					{members.length === 0 ? (
						<div className="text-center py-12">
							<p className="text-muted-foreground">
								{t("committee.no_members")}
							</p>
						</div>
					) : (
						<div
							className="transition-opacity duration-200"
							style={isInfoReel ? { opacity: itemOpacity } : undefined}
						>
							<div
								key={isInfoReel ? `committee-page-${activeIndex}` : "committee-grid"}
								className={`${isInfoReel
									? membersPerPage === 1
										? "grid grid-cols-1"
										: "grid grid-cols-2"
									: "flex flex-row flex-wrap group/list"
									} ${isInfoReel ? "animate-reel-fade-in" : ""}`}
							>
								{(isInfoReel ? visibleMembers : members).map((member, idx) => {
									const isFocused = isInfoReel ? idx === focusedMemberIndex : false;
									return (
										<CommitteeMemberCard
											key={member.id}
											member={member}
											noDescriptionLabel={t("committee.no_description")}
											isInfoReel={isInfoReel}
											itemOpacity={itemOpacity}
											isFocused={isFocused}
										/>
									);
								})}
							</div>
						</div>
					)}
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
