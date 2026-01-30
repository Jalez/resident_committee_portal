import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("setup", "routes/_setup.tsx"),
	index("routes/home.tsx"),
	route("events", "routes/events.tsx"),
	route("contact", "routes/contact.tsx"),
	route("social", "routes/social.tsx"),
	route("social/new", "routes/social.new.tsx"),
	route("treasury", "routes/treasury.tsx"),
	route("treasury/breakdown", "routes/treasury.breakdown.tsx"),
	route("treasury/transactions", "routes/treasury.transactions.tsx"),
	route(
		"treasury/transactions/:transactionId",
		"routes/treasury.transactions.$transactionId.tsx",
	),
	route(
		"treasury/transactions/:transactionId/edit",
		"routes/treasury.transactions.$transactionId.edit.tsx",
	),
	route("treasury/reimbursements", "routes/treasury.reimbursements.tsx"),
	route(
		"treasury/reimbursements/:purchaseId",
		"routes/treasury.reimbursements.$purchaseId.tsx",
	),
	route(
		"treasury/reimbursements/:purchaseId/edit",
		"routes/treasury.reimbursements.$purchaseId.edit.tsx",
	),
	route("treasury/reimbursement/new", "routes/treasury.reimbursement.new.tsx"),
	route("treasury/reimbursements/new", "routes/treasury.reimbursement.new.tsx", { id: "treasury-reimbursements-new-alias" }),
	route("treasury/transactions/new", "routes/treasury.transactions.new.tsx"),
	route("minutes", "routes/minutes.tsx"),
	route("news", "routes/news.tsx"),
	route("news/new", "routes/news.new.tsx"),
	route("news/:newsId/edit", "routes/news.$newsId.edit.tsx"),
	route("faq", "routes/faq.tsx"),
	route("faq/new", "routes/faq.new.tsx"),
	route("faq/:faqId/edit", "routes/faq.$faqId.edit.tsx"),
	route("inventory", "routes/inventory.tsx"),
	route("inventory/new", "routes/inventory.new.tsx"),
	route("inventory/:itemId/edit", "routes/inventory.$itemId.edit.tsx"),
	// Auth routes
	route("auth/login", "routes/auth.login.tsx"),
	route("auth/callback", "routes/auth.callback.tsx"),
	route("auth/logout", "routes/auth.logout.tsx"),
	// User routes
	route("profile", "routes/profile.tsx"),
	route("messages", "routes/messages.tsx"),
	// Staff routes (admin + board_member)
	route("submissions", "routes/submissions.tsx"),
	// Settings routes (admin only)
	route("settings/general", "routes/settings.general.tsx"),
	route("settings/users", "routes/settings.users.tsx"),
	route("settings/roles", "routes/settings.roles.tsx"),
	route("settings/reimbursements", "routes/settings.reimbursements.tsx"),
	route("settings/analytics", "routes/settings.analytics.tsx"),
	route("settings/news", "routes/settings.news.tsx"),
	route("settings/faqs", "routes/settings.faqs.tsx"),

	// Analytics
	route("analytics", "routes/analytics.tsx"),

	// API Routes
	route("api/minutes", "routes/api.minutes.tsx"),
	route("api/analytics/export", "routes/api.analytics.export.tsx"),
	route("api/analytics/analyze", "routes/api.analytics.analyze.tsx"),
	route("api/inventory/export", "routes/api.inventory.export.tsx"),
	route("api/inventory/import", "routes/api.inventory.import.tsx"),
	route("api/webhooks/resend", "routes/api.webhooks.resend.tsx"),
	route("api/treasury/export", "routes/api.treasury.export.tsx"),
	route("api/treasury/import", "routes/api.treasury.import.tsx"),
	route("api/messages/mark-read", "routes/api.messages.mark-read.tsx"),
	route("api/set-language", "routes/api.set-language.ts"),
] satisfies RouteConfig;
