// Shared navigation configuration used by both Navigation component and InfoReelProvider
// This ensures info reel cycles through routes that match what guests can see in navigation

export interface NavItem {
	path: string;
	icon: string;
	i18nKey: string; // Key for translation (e.g., "nav.events")
	permission?: string;
	showWhen?: "logged-out";
	infoReelDuration?: number; // Optional override duration for info reel (ms)
}

// All navigation items with their permissions
export const NAV_ITEMS: NavItem[] = [
	{ path: "/", icon: "volunteer_activism", i18nKey: "nav.get_involved" },
	{
		path: "/events",
		icon: "event",
		i18nKey: "nav.events",
		permission: "events:read",
	},
	{
		path: "/treasury",
		icon: "payments",
		i18nKey: "nav.treasury",
		permission: "treasury:read",
	},
	{
		path: "/minutes",
		icon: "description",
		i18nKey: "nav.minutes",
		permission: "minutes:read",
	},
	{
		path: "/inventory",
		icon: "inventory_2",
		i18nKey: "nav.inventory",
		permission: "inventory:read",
	},
	{
		path: "/social",
		icon: "forum",
		i18nKey: "nav.social",
		permission: "social:read",
		infoReelDuration: 16000,
	},
	// Auth items - shown conditionally
	{
		path: "/auth/login",
		icon: "login",
		i18nKey: "nav.login",
		showWhen: "logged-out",
	},
	// Submissions - requires submissions:read permission
	{
		path: "/submissions",
		icon: "mail",
		i18nKey: "nav.submissions",
		permission: "submissions:read",
	},
];

// Routes that should be included in info reel when user has permission
// Excludes login and other interactive-only routes
export const INFO_REEL_ELIGIBLE_PATHS = [
	"/",
	"/events",
	"/treasury",
	"/minutes",
	"/inventory",
	"/social",
];

// Get nav items filtered for info reel (only routes that are good for cycling display)
export function getInfoReelNavItems(): NavItem[] {
	return NAV_ITEMS.filter((item) =>
		INFO_REEL_ELIGIBLE_PATHS.includes(item.path),
	);
}
