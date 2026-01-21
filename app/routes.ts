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
	route("treasury/breakdown/:transactionId/edit", "routes/treasury.breakdown.$transactionId.edit.tsx"),
	route("treasury/reimbursements", "routes/treasury.reimbursements.tsx"),
	route("treasury/reimbursement/new", "routes/treasury.reimbursement.new.tsx"),
	route("treasury/new", "routes/treasury.new.tsx"),
	route("minutes", "routes/minutes.tsx"),
	route("inventory", "routes/inventory.tsx"),
	route("inventory/new", "routes/inventory.new.tsx"),
	route("inventory/:itemId/edit", "routes/inventory.$itemId.edit.tsx"),
	// Auth routes
	route("auth/login", "routes/auth.login.tsx"),
	route("auth/callback", "routes/auth.callback.tsx"),
	route("auth/logout", "routes/auth.logout.tsx"),
	// User routes
	route("profile", "routes/profile.tsx"),
	// Staff routes (admin + board_member)
	route("submissions", "routes/submissions.tsx"),
	// Settings routes (admin only)
	route("settings/users", "routes/settings.users.tsx"),
	route("settings/roles", "routes/settings.roles.tsx"),
	route("settings/reimbursements", "routes/settings.reimbursements.tsx"),
	// API routes
	route("api/risc/receiver", "routes/api.risc.receiver.tsx"),
	route("api/inventory/export", "routes/api.inventory.export.tsx"),
	route("api/inventory/import", "routes/api.inventory.import.tsx"),
	route("api/webhooks/resend", "routes/api.webhooks.resend.tsx"),
	route("api/treasury/export", "routes/api.treasury.export.tsx"),
] satisfies RouteConfig;

