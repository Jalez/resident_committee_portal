import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("setup", "routes/_setup.tsx"),
	index("routes/home.tsx"),
	route("events", "routes/events.tsx"),
	route("events/new", "routes/events.new.tsx"),
	route("events/:eventId/edit", "routes/events.$eventId.edit.tsx"),
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
	route("treasury/receipts", "routes/treasury.receipts.tsx"),
	route("treasury/receipts/new", "routes/treasury.receipts.new.tsx"),
	route(
		"treasury/receipts/:receiptId",
		"routes/treasury.receipts.$receiptId.tsx",
	),
	route(
		"treasury/receipts/:receiptId/edit",
		"routes/treasury.receipts.$receiptId.edit.tsx",
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
	route("treasury/budgets", "routes/treasury.budgets.tsx"),
	route("treasury/budgets/new", "routes/treasury.budgets.new.tsx"),
	route(
		"treasury/budgets/:budgetId",
		"routes/treasury.budgets.$budgetId.tsx",
	),
	route(
		"treasury/budgets/:budgetId/edit",
		"routes/treasury.budgets.$budgetId.edit.tsx",
	),
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
	route("committee", "routes/committee.tsx"),
	// Staff routes (admin + board_member)
	route("submissions", "routes/submissions.tsx"),
	route("mail", "routes/mail.tsx", [
		index("routes/mail._index.tsx"),
		route("new", "routes/mail.new.redirect.tsx"),
		route("compose", "routes/mail.compose.tsx"),
		route("drafts", "routes/mail.drafts.tsx"),
		route("thread/:threadId", "routes/mail.thread.$threadId.tsx"),
		route(":messageId", "routes/mail.$messageId.tsx"),
	]),
	route("committee/mail", "routes/committee.mail.redirect.tsx"),

	// Admin routes
	route("admin/storage/receipts", "routes/admin.storage.receipts.tsx"),
	route("admin/storage/avatars", "routes/admin.storage.avatars.tsx"),

	// Settings routes (admin only)
	route("settings/general", "routes/settings.general.tsx"),
	route("settings/users", "routes/settings.users.tsx"),
	route("settings/roles", "routes/settings.roles.tsx"),
	route("settings/reimbursements", "routes/settings.reimbursements.tsx"),
	route("settings/analytics", "routes/settings.analytics.tsx"),
	route("settings/news", "routes/settings.news.tsx"),
	route("settings/faqs", "routes/settings.faqs.tsx"),
	route("settings/receipts", "routes/settings.receipts.tsx"),

	// Analytics (redirect to polls/analytics)
	route("analytics", "routes/analytics.tsx"),

	// Polls
	route("polls", "routes/polls.tsx"),
	route("polls/new", "routes/polls.new.tsx"),
	route("polls/analytics", "routes/polls.analytics.tsx"),
	route("polls/:pollId/edit", "routes/polls.$pollId.edit.tsx"),

	// API Routes
	route("api/minutes", "routes/api.minutes.tsx"),
	route("api/avatar/upload", "routes/api.avatar.upload.tsx"),
	route("api/avatar/set", "routes/api.avatar.set.tsx"),
	route("api/avatars/delete", "routes/api.avatars.delete.tsx"),
	route("api/receipts/upload", "routes/api.receipts.upload.tsx"),
	route("api/receipts/thumbnail", "routes/api.receipts.thumbnail.tsx"),
	route("api/receipts/rename", "routes/api.receipts.rename.tsx"),
	route("api/receipts/delete", "routes/api.receipts.delete.tsx"),
	route("api/receipts/ocr", "routes/api.receipts.ocr.tsx"),
	route("api/analytics/export", "routes/api.analytics.export.tsx"),
	route("api/analytics/analyze", "routes/api.analytics.analyze.tsx"),
	route("api/analytics/questions", "routes/api.analytics.questions.tsx"),
	route("api/inventory/export", "routes/api.inventory.export.tsx"),
	route("api/inventory/import", "routes/api.inventory.import.tsx"),
	route("api/webhooks/resend", "routes/api.webhooks.resend.tsx"),
	route("api/treasury/export", "routes/api.treasury.export.tsx"),
	route("api/treasury/import", "routes/api.treasury.import.tsx"),
	route("api/messages/mark-read", "routes/api.messages.mark-read.tsx"),
	route("api/set-language", "routes/api.set-language.ts"),
] satisfies RouteConfig;
