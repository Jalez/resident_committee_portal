// Shared navigation configuration used by both Navigation component and InfoReelProvider
// This ensures info reel cycles through routes that match what guests can see in navigation

export interface NavItem {
    path: string;
    icon: string;
    label: string;
    subLabel: string;
    permission?: string;
    showWhen?: "logged-out";
    infoReelDuration?: number; // Optional override duration for info reel (ms)
}

// All navigation items with their permissions
export const NAV_ITEMS: NavItem[] = [
    { path: "/", icon: "volunteer_activism", label: "Osallistu", subLabel: "Get Involved" },
    { path: "/events", icon: "event", label: "Tapahtumat", subLabel: "Events", permission: "events:read" },
    { path: "/treasury", icon: "payments", label: "Rahasto", subLabel: "Treasury", permission: "treasury:read" },
    { path: "/minutes", icon: "description", label: "Pöytäkirjat", subLabel: "Minutes", permission: "minutes:read" },
    { path: "/inventory", icon: "inventory_2", label: "Tavaraluettelo", subLabel: "Inventory", permission: "inventory:read" },
    { path: "/social", icon: "forum", label: "Some", subLabel: "Social", permission: "social:read", infoReelDuration: 16000 },
    // Auth items - shown conditionally
    { path: "/auth/login", icon: "login", label: "Kirjaudu", subLabel: "Login", showWhen: "logged-out" },
    // Submissions - requires submissions:read permission
    { path: "/submissions", icon: "mail", label: "Yhteydenotot", subLabel: "Submissions", permission: "submissions:read" },
];

// Routes that should be included in info reel when user has permission
// Excludes login and other interactive-only routes
export const INFO_REEL_ELIGIBLE_PATHS = ["/", "/events", "/treasury", "/minutes", "/inventory", "/social"];

// Get nav items filtered for info reel (only routes that are good for cycling display)
export function getInfoReelNavItems(): NavItem[] {
    return NAV_ITEMS.filter(item => INFO_REEL_ELIGIBLE_PATHS.includes(item.path));
}
