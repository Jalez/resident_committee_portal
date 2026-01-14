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
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "~/components/ui/tooltip";

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
        { path: "/treasury", icon: "payments", label: "Rahasto", subLabel: "Treasury" },
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
        <TooltipProvider delayDuration={200}>
            <nav className={cn(
                "flex items-center justify-center gap-1",
                orientation === "vertical" ? "flex-col h-full" : "flex-row w-full",
                className
            )}>
                {navItems.map((item) => {
                    const isActive = pathname === item.path;
                    const isAnimating = isActive && isInfoReel;

                    return (
                        <Tooltip key={item.path}>
                            <TooltipTrigger asChild>
                                <Link
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
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent
                                side={orientation === "vertical" ? "right" : "bottom"}
                                className={cn(
                                    "font-bold",
                                    // Hide tooltip on large screens when horizontal (labels are visible)
                                    orientation === "horizontal" && "lg:hidden"
                                )}
                            >
                                <span>{item.label}</span>
                                <span className="text-muted-foreground ml-1">/ {item.subLabel}</span>
                            </TooltipContent>
                        </Tooltip>
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
        </TooltipProvider>
    );
}
