import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("events", "routes/events.tsx"),
	route("contact", "routes/contact.tsx"),
	route("social", "routes/social.tsx"),
	route("budget", "routes/budget.tsx"),
	route("budget/breakdown", "routes/budget.breakdown.tsx"),
	route("budget/reimbursements", "routes/budget.reimbursements.tsx"),
	route("budget/reimbursement/new", "routes/budget.reimbursement.new.tsx"),
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
	// Admin routes
	route("admin/board", "routes/admin.board.tsx"),
	route("admin/users", "routes/admin.users.tsx"),
	route("admin/purchases", "routes/admin.purchases.tsx"),
	route("admin/budget", "routes/admin.budget.tsx"),
	// API routes
	route("api/risc/receiver", "routes/api.risc.receiver.tsx"),
	route("api/inventory/export", "routes/api.inventory.export.tsx"),
	route("api/inventory/import", "routes/api.inventory.import.tsx"),
] satisfies RouteConfig;
