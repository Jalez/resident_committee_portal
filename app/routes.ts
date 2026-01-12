import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("events", "routes/events.tsx"),
	route("contact", "routes/contact.tsx"),
	route("social", "routes/social.tsx"),
	route("budget", "routes/budget.tsx"),
	route("minutes", "routes/minutes.tsx"),
	route("inventory", "routes/inventory.tsx"),
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
	// API routes
	route("api/risc/receiver", "routes/api.risc.receiver.tsx"),
] satisfies RouteConfig;
