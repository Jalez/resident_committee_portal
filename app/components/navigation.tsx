import { Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";
import { useInfoReel } from "~/contexts/info-reel-context";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface UserInfo {
    email: string;
    name?: string;
    isAdmin: boolean;
    role?: "resident" | "board_member" | "admin";
}

interface NavVisibility {
    showLogin: boolean;
    showLogout: boolean;
    showProfile: boolean;
    showSubmissions: boolean;
    showUsers: boolean;
}

interface NavigationProps {
    className?: string;
    orientation?: "vertical" | "horizontal";
    user?: UserInfo | null;
    navVisibility?: NavVisibility;
}

export function Navigation({ className, orientation = "vertical", user, navVisibility }: NavigationProps) {
    const location = useLocation();
    const pathname = location.pathname;
    const { isInfoReel, fillProgress, opacity } = useInfoReel();

    // Check if profile menu should be shown (user is logged in)
    const showProfileMenu = navVisibility ? navVisibility.showProfile : !!user;

    const allNavItems = [
        { path: "/", icon: "volunteer_activism", label: "Osallistu", subLabel: "Get Involved" },
        { path: "/events", icon: "event", label: "Tapahtumat", subLabel: "Events" },
        { path: "/budget", icon: "payments", label: "Budjetti", subLabel: "Budget" },
        { path: "/minutes", icon: "description", label: "Pöytäkirjat", subLabel: "Minutes" },
        { path: "/inventory", icon: "inventory_2", label: "Tavaraluettelo", subLabel: "Inventory" },
        { path: "/social", icon: "forum", label: "Some", subLabel: "Social" },
        // Auth items - shown conditionally
        { path: "/auth/login", icon: "login", label: "Kirjaudu", subLabel: "Login", showWhen: "logged-out" },
        // Staff items (admin or board_member)
        { path: "/submissions", icon: "mail", label: "Yhteydenotot", subLabel: "Submissions", showWhen: "staff" },
        // Admin items
        { path: "/admin/users", icon: "manage_accounts", label: "Käyttäjät", subLabel: "Users", showWhen: "admin" },
    ] as const;

    // Filter nav items based on server-computed visibility and info reel mode
    const navItems = allNavItems.filter(item => {
        if (isInfoReel && 'showWhen' in item) return false;
        if (!('showWhen' in item)) return true;

        // Use server-computed visibility flags
        if (navVisibility) {
            switch (item.showWhen) {
                case "logged-out": return navVisibility.showLogin;
                case "staff": return navVisibility.showSubmissions;
                case "admin": return navVisibility.showUsers;
                default: return true;
            }
        }

        // Fallback for when navVisibility is not provided
        switch (item.showWhen) {
            case "logged-out": return !user;
            case "staff": return user?.role === "admin" || user?.role === "board_member";
            case "admin": return user?.isAdmin;
            default: return true;
        }
    });

    const isProfileActive = pathname === "/profile";

    return (
        <nav className={cn(
            "flex items-center justify-center gap-1",
            orientation === "vertical" ? "flex-col h-full" : "flex-row w-full",
            className
        )}>
            {navItems.map((item) => {
                const isActive = pathname === item.path;
                const isAnimating = isActive && isInfoReel;

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                            "relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
                            "hover:bg-primary/10 hover:text-primary",
                            !isAnimating && isActive && "text-primary bg-primary/10",
                            !isActive && "text-gray-500 dark:text-gray-400"
                        )}
                        style={isAnimating ? {
                            color: `color-mix(in srgb, var(--primary) ${opacity * 100}%, var(--muted-foreground) ${(1 - opacity) * 100}%)`
                        } : undefined}
                    >
                        {/* Animated filling background for active item in info reel mode */}
                        {isAnimating && (
                            <div
                                className="absolute inset-0 bg-primary/10"
                                style={{
                                    clipPath: `inset(0 ${100 - fillProgress}% 0 0)`,
                                    opacity: opacity
                                }}
                            />
                        )}

                        <span className="relative material-symbols-outlined text-2xl md:text-3xl">
                            {item.icon}
                        </span>

                        <div className={cn(
                            "relative flex-col items-start leading-none hidden lg:flex",
                            orientation === "vertical" && "lg:hidden" // Hide even on large if vertical (uses sidebar tooltips)
                        )}>
                            <span className="text-sm md:text-base font-bold">{item.label}</span>
                            <span className="text-[10px] md:text-xs opacity-60 font-medium">{item.subLabel}</span>
                        </div>

                        {/* Tooltip - Show when labels are hidden (small screens or vertical) */}
                        <div className={cn(
                            "absolute bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg px-3 py-2",
                            "opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap shadow-xl z-[60]",
                            // Vertical Sidebar Tooltip (Right)
                            orientation === "vertical"
                                ? "left-full ml-4 translate-x-[-10px] group-hover:translate-x-0 top-1/2 -translate-y-1/2"
                                : "top-full mt-2 left-1/2 -translate-x-1/2 translate-y-[-10px] group-hover:translate-y-0 lg:hidden", // Horizontal Bottom Tooltip (Small screens only)
                        )}>
                            <span className="block text-sm font-bold leading-none">
                                {item.label}
                            </span>
                            {/* Arrow */}
                            <div className={cn(
                                "absolute border-[5px] border-transparent",
                                orientation === "vertical"
                                    ? "right-[100%] top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-white"
                                    : "bottom-[100%] left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-white"
                            )} />
                        </div>
                    </Link>
                );
            })}

            {/* Profile Dropdown Menu - Only show when logged in */}
            {showProfileMenu && !isInfoReel && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                "relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
                                "hover:bg-primary/10 hover:text-primary cursor-pointer",
                                isProfileActive ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400"
                            )}
                        >
                            <span className="relative material-symbols-outlined text-2xl md:text-3xl">
                                person
                            </span>

                            <div className={cn(
                                "relative flex-col items-start leading-none hidden lg:flex",
                                orientation === "vertical" && "lg:hidden"
                            )}>
                                <span className="text-sm md:text-base font-bold">Profiili</span>
                                <span className="text-[10px] md:text-xs opacity-60 font-medium">Profile</span>
                            </div>

                            {/* Dropdown indicator */}
                            <span className="material-symbols-outlined text-sm opacity-60 hidden lg:block">
                                expand_more
                            </span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem asChild>
                            <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">edit</span>
                                <div>
                                    <p className="font-medium">Muokkaa profiilia</p>
                                    <p className="text-xs text-muted-foreground">Edit profile</p>
                                </div>
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild variant="destructive">
                            <Link to="/auth/logout" className="flex items-center gap-2 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">logout</span>
                                <div>
                                    <p className="font-medium">Kirjaudu ulos</p>
                                    <p className="text-xs opacity-75">Log out</p>
                                </div>
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </nav>
    );
}
