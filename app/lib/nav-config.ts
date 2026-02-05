// Shared navigation configuration used by both Navigation component and InfoReelProvider
// This ensures info reel cycles through routes that match what guests can see in navigation

export interface NavItemChild {
	path: string;
	icon: string;
	i18nKey: string;
	permission?: string;
}

export interface NavItem {
	path: string;
	icon: string;
	i18nKey: string; // Key for translation (e.g., "nav.events")
	permission?: string;
	showWhen?: "logged-out";
	infoReelDuration?: number; // Optional override duration for info reel (ms)
	/** Sub-items (e.g. Mail > Inbox, Sent, Drafts, Compose) */
	children?: NavItemChild[];
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
		children: [
			{ path: "/treasury", icon: "account_balance", i18nKey: "treasury.overview" },
			{ path: "/treasury/breakdown", icon: "pie_chart", i18nKey: "treasury.actions.breakdown", permission: "treasury:breakdown:read" },
			{ path: "/treasury/transactions", icon: "list_alt", i18nKey: "treasury.actions.transactions", permission: "treasury:transactions:read" },
			{ path: "/treasury/receipts", icon: "receipt_long", i18nKey: "treasury.actions.receipts", permission: "treasury:read" },
			{ path: "/treasury/reimbursements", icon: "request_quote", i18nKey: "treasury.actions.reimbursements", permission: "treasury:reimbursements:read" },
			{ path: "/treasury/budgets", icon: "bookmark", i18nKey: "treasury.actions.budgets", permission: "treasury:budgets:read" },
		],
	},
	{
		path: "/minutes",
		icon: "description",
		i18nKey: "nav.minutes",
		permission: "minutes:read",
	},
	{
		path: "/news",
		icon: "newspaper",
		i18nKey: "nav.news",
		permission: "news:read",
	},
	{
		path: "/faq",
		icon: "help",
		i18nKey: "nav.faq",
		permission: "faq:read",
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
	{
		path: "/polls",
		icon: "ballot",
		i18nKey: "nav.polls",
		permission: "polls:read",
		children: [
			{ path: "/polls", icon: "ballot", i18nKey: "polls.title" },
			{ path: "/polls/analytics", icon: "analytics", i18nKey: "polls.analytics", permission: "forms:read" },
		],
	},
	// Committee - requires committee:read permission
	{
		path: "/committee",
		icon: "groups",
		i18nKey: "nav.committee",
		permission: "committee:read",
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
	// Mail (direct communication) - requires committee:email; sub-items in nav
	{
		path: "/mail",
		icon: "send",
		i18nKey: "nav.committee_mail",
		permission: "committee:email",
		children: [
			{ path: "/mail", icon: "inbox", i18nKey: "mail.inbox" },
			{ path: "/mail?direction=sent", icon: "send", i18nKey: "mail.sent" },
			{ path: "/mail/drafts", icon: "draft", i18nKey: "mail.drafts" },
			{ path: "/mail?compose=new", icon: "edit_note", i18nKey: "mail.compose" },
		],
	},
];

// Routes that should be included in info reel when user has permission
// Excludes login and other interactive-only routes
export const INFO_REEL_ELIGIBLE_PATHS = [
	"/",
	"/events",
	"/treasury",
	"/minutes",
	"/news",
	"/faq",
	"/inventory",
	"/social",
];

// Get nav items filtered for info reel (only routes that are good for cycling display)
export function getInfoReelNavItems(): NavItem[] {
	return NAV_ITEMS.filter((item) =>
		INFO_REEL_ELIGIBLE_PATHS.includes(item.path),
	);
}
