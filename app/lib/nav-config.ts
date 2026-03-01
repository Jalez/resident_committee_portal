// Shared navigation configuration used by both Navigation component and InfoReelProvider
// This ensures info reel cycles through routes that match what guests can see in navigation
import { ENTITY_REGISTRY } from "./entity-registry";

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
		icon: ENTITY_REGISTRY.event.icon,
		i18nKey: "nav.events",
		permission: "events:read",
	},
	{
		path: "/treasury",
		icon: "payments",
		i18nKey: "nav.treasury",
		permission: "treasury:read",
		children: [
			{
				path: "/treasury",
				icon: "account_balance",
				i18nKey: "treasury.overview",
			},
			{
				path: "/treasury/breakdown",
				icon: "pie_chart",
				i18nKey: "treasury.actions.breakdown",
				permission: "treasury:breakdown:read",
			},
			{
				path: "/treasury/transactions",
				icon: ENTITY_REGISTRY.transaction.icon,
				i18nKey: "treasury.actions.transactions",
				permission: "treasury:transactions:read",
			},
			{
				path: "/treasury/receipts",
				icon: ENTITY_REGISTRY.receipt.icon,
				i18nKey: "treasury.actions.receipts",
				permission: "treasury:receipts:read",
			},
			{
				path: "/treasury/reimbursements",
				icon: ENTITY_REGISTRY.reimbursement.icon,
				i18nKey: "treasury.actions.reimbursements",
				permission: "treasury:reimbursements:read",
			},
			{
				path: "/treasury/budgets",
				icon: ENTITY_REGISTRY.budget.icon,
				i18nKey: "treasury.actions.budgets",
				permission: "treasury:budgets:read",
			},
			{
				path: "/treasury/guide",
				icon: "menu_book",
				i18nKey: "treasury.actions.guide",
			},
		],
	},
	{
		path: "/minutes",
		icon: ENTITY_REGISTRY.minute.icon,
		i18nKey: "nav.minutes",
		permission: "minutes:read",
	},
	{
		path: "/news",
		icon: ENTITY_REGISTRY.news.icon,
		i18nKey: "nav.news",
		permission: "news:read",
	},
	{
		path: "/faq",
		icon: ENTITY_REGISTRY.faq.icon,
		i18nKey: "nav.faq",
		permission: "faq:read",
	},
	{
		path: "/inventory",
		icon: ENTITY_REGISTRY.inventory.icon,
		i18nKey: "nav.inventory",
		permission: "inventory:read",
	},
	{
		path: "/social",
		icon: ENTITY_REGISTRY.social.icon,
		i18nKey: "nav.social",
		permission: "social:read",
		infoReelDuration: 16000,
	},
	{
		path: "/polls",
		icon: ENTITY_REGISTRY.poll.icon,
		i18nKey: "nav.polls",
		permission: "polls:read",
		children: [
			{
				path: "/polls",
				icon: ENTITY_REGISTRY.poll.icon,
				i18nKey: "polls.title",
			},
			{
				path: "/polls/analytics",
				icon: "analytics",
				i18nKey: "polls.analytics",
				permission: "forms:read",
			},
		],
	},
	// Committee - requires committee:read permission
	{
		path: "/committee",
		icon: "groups",
		i18nKey: "nav.committee",
		permission: "committee:read",
		infoReelDuration: 24000,
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
		icon: ENTITY_REGISTRY.submission.icon,
		i18nKey: "nav.submissions",
		permission: "submissions:read",
	},
	// Mail (direct communication) - requires committee:email; sub-items in nav
	{
		path: "/mail",
		icon: ENTITY_REGISTRY.mail_thread.icon,
		i18nKey: "nav.committee_mail",
		permission: "committee:email",
		children: [
			{ path: "/mail/received", icon: "inbox", i18nKey: "mail.inbox" },
			{ path: "/mail/sent", icon: "send", i18nKey: "mail.sent" },
			{ path: "/mail/drafts", icon: "draft", i18nKey: "mail.drafts" },
			{ path: "/mail/compose", icon: "edit_note", i18nKey: "mail.compose" },
		],
	},
	// Admin - requires admin:storage:read permission
	{
		path: "/admin",
		icon: "admin_panel_settings",
		i18nKey: "nav.admin",
		permission: "admin:storage:read",
		children: [
			{
				path: "/admin/storage/minutes",
				icon: "description",
				i18nKey: "admin.storage.minutes",
				permission: "admin:storage:read",
			},
			{
				path: "/admin/storage/receipts",
				icon: "receipt_long",
				i18nKey: "admin.storage.receipts",
				permission: "admin:storage:read",
			},
			{
				path: "/admin/storage/avatars",
				icon: "account_circle",
				i18nKey: "admin.storage.avatars",
				permission: "admin:storage:read",
			},
		],
	},
];

// Routes that should be included in info reel when user has permission
// Excludes login and other interactive-only routes
export const INFO_REEL_ELIGIBLE_PATHS = [
	"/",
	"/events",
	"/treasury",
	"/committee",
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
