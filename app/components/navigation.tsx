import { Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";
import { useInfoReel } from "~/contexts/info-reel-context";
import { useUser } from "~/contexts/user-context";
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
import { NAV_ITEMS } from "~/lib/nav-config";

interface NavigationProps {
    className?: string;
    orientation?: "vertical" | "horizontal";
}

export function Navigation({ className, orientation = "vertical" }: NavigationProps) {
    const location = useLocation();
    const pathname = location.pathname;
    const { isInfoReel, fillProgress, opacity } = useInfoReel();
    const { user, hasPermission, hasAnyPermission } = useUser();

    // Check if profile menu should be shown (user is logged in, not guest)
    const showProfileMenu = user && user.userId !== "guest";

    // Check if settings menu should be shown (has any admin permissions)
    const showSettingsMenu = !isInfoReel && hasAnyPermission(["users:read", "roles:read", "reimbursements:approve"]);

    // Use shared nav items configuration
    const allNavItems = NAV_ITEMS;

    // Filter nav items based on permissions and info reel mode
    const navItems = allNavItems.filter(item => {
        // During info reel: only hide login/logout items, show permitted routes
        if (isInfoReel && item.showWhen) return false;

        // Always show items without conditions
        if (!item.showWhen && !item.permission) return true;

        // Handle login visibility (show for guests, hide for logged-in users)
        if (item.showWhen === "logged-out") {
            return !user || user.userId === "guest";
        }

        // Handle permission-based visibility
        if (item.permission) {
            return hasPermission(item.permission);
        }

        return true;
    });

    const isProfileActive = pathname === "/profile";
    const isSettingsActive = pathname.startsWith("/settings");

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

                {/* Settings Dropdown Menu - Only show for admins */}
                {showSettingsMenu && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    "relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
                                    "hover:bg-primary/10 hover:text-primary cursor-pointer",
                                    isSettingsActive ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400"
                                )}
                            >
                                <span className="relative material-symbols-outlined text-2xl md:text-3xl">
                                    settings
                                </span>

                                <div className={cn(
                                    "relative flex-col items-start leading-none hidden lg:flex",
                                    orientation === "vertical" && "lg:hidden"
                                )}>
                                    <span className="text-sm md:text-base font-bold">Asetukset</span>
                                    <span className="text-[10px] md:text-xs opacity-60 font-medium">Settings</span>
                                </div>

                                {/* Dropdown indicator */}
                                <span className="material-symbols-outlined text-sm opacity-60 hidden lg:block">
                                    expand_more
                                </span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {hasPermission("users:read") && (
                                <DropdownMenuItem asChild>
                                    <Link to="/settings/users" className="flex items-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-lg">manage_accounts</span>
                                        <div>
                                            <p className="font-medium">Käyttäjät</p>
                                            <p className="text-xs text-muted-foreground">Users</p>
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            {hasPermission("roles:read") && (
                                <DropdownMenuItem asChild>
                                    <Link to="/settings/roles" className="flex items-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-lg">shield_person</span>
                                        <div>
                                            <p className="font-medium">Roolit</p>
                                            <p className="text-xs text-muted-foreground">Roles</p>
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            {hasPermission("reimbursements:approve") && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/settings/reimbursements" className="flex items-center gap-2 cursor-pointer">
                                            <span className="material-symbols-outlined text-lg">smart_toy</span>
                                            <div>
                                                <p className="font-medium">Korvaukset</p>
                                                <p className="text-xs text-muted-foreground">Reimbursements</p>
                                            </div>
                                        </Link>
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

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
