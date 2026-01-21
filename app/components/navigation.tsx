import { Link, useLocation } from "react-router";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { useInfoReel } from "~/contexts/info-reel-context";
import { useUser } from "~/contexts/user-context";
import { useLanguage } from "~/contexts/language-context";
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
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetClose,
} from "~/components/ui/sheet";
import { XIcon } from "lucide-react";
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
    const { language, setLanguage, isInfoReel: contextIsInfoReel } = useLanguage();
    // Use isInfoReel from language context to ensure consistency, though they should be same
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const toggleLanguage = () => {
        setLanguage(language === "fi" ? "en" : "fi");
    };

    // Check if profile menu should be shown (user is logged in, not guest)
    const showProfileMenu = user && user.userId !== "guest";

    // Check if settings menu should be shown (has any admin permissions)
    const showSettingsMenu = !isInfoReel && hasAnyPermission(["settings:users", "settings:roles", "settings:reimbursements"]);

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

    // Shared nav item renderer
    const renderNavItem = (item: typeof navItems[0], isMobile = false) => {
        const isActive = pathname === item.path;
        const isAnimating = isActive && isInfoReel;

        return (
            <Link
                key={item.path}
                to={item.path}
                onClick={() => isMobile && setMobileMenuOpen(false)}
                className={cn(
                    "relative group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 overflow-hidden",
                    "hover:bg-primary/10 hover:text-primary",
                    !isAnimating && isActive && "text-primary bg-primary/10",
                    !isActive && "text-gray-500 dark:text-gray-400",
                    isMobile && "w-full shrink-0"
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

                <span className="relative material-symbols-outlined text-2xl">
                    {item.icon}
                </span>

                {/* Always show labels in mobile menu */}
                {isMobile && (
                    <div className="relative flex flex-col items-start leading-none">
                        <span className="text-sm font-bold">
                            {(language === "fi" || isInfoReel) ? item.label : item.subLabel}
                        </span>
                        {isInfoReel && (
                            <span className="text-xs opacity-60 font-medium">{item.subLabel}</span>
                        )}
                    </div>
                )}
            </Link>
        );
    };

    // Get current page info for mobile menu button
    const currentNavItem = navItems.find(item => item.path === pathname) ||
        allNavItems.find(item => item.path === pathname);
    const isHomePage = pathname === "/";
    const mobileMenuLabel = isHomePage
        ? "Valikko / Menu"
        : currentNavItem
            ? `${currentNavItem.label} / ${currentNavItem.subLabel}`
            : "Valikko / Menu";
    const mobileMenuIcon = isHomePage
        ? "menu"
        : currentNavItem?.icon || "menu";

    return (
        <TooltipProvider delayDuration={200}>
            {/* Mobile: Hamburger menu button + Sheet */}
            <div className="md:hidden flex items-center justify-center w-full">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                    <SheetTrigger asChild>
                        <button
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-primary/10 hover:text-primary transition-all"
                        >
                            <span className="material-symbols-outlined text-2xl">{mobileMenuIcon}</span>
                            <span className="text-sm font-bold">{mobileMenuLabel}</span>
                            <span className="material-symbols-outlined text-lg opacity-60">expand_more</span>
                        </button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-80 h-full flex flex-col" showClose={false}>
                        <SheetHeader className="shrink-0 flex flex-row items-center gap-2 space-y-0">
                            <SheetClose className="p-1 rounded-md hover:bg-muted transition-colors">
                                <XIcon className="size-5" />
                                <span className="sr-only">Close</span>
                            </SheetClose>
                            <SheetTitle className="text-left text-lg font-black">
                                {language === "fi" ? "Navigointi" : "Navigation"}
                            </SheetTitle>
                        </SheetHeader>
                        <nav className="flex flex-col gap-1 mt-4 overflow-y-auto min-h-0 flex-1 pb-8">
                            {/* Language Switcher Mobile */}
                            {!isInfoReel && (
                                <button
                                    onClick={toggleLanguage}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-primary/10 hover:text-primary text-gray-500 dark:text-gray-400"
                                >
                                    <span className="material-symbols-outlined text-2xl">translate</span>
                                    <div className="flex flex-col items-start leading-none">
                                        <span className="text-sm font-bold">
                                            {language === "fi" ? "Suomi" : "English"}
                                        </span>
                                        <span className="text-xs opacity-60 font-medium">
                                            {language === "fi" ? "Kieli / Language" : "Language / Kieli"}
                                        </span>
                                    </div>
                                </button>
                            )}

                            {navItems.map((item) => renderNavItem(item, true))}

                            {/* Settings in mobile menu */}
                            {showSettingsMenu && (
                                <div className="mt-4 pt-4 border-t border-border">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">
                                        {language === "fi" ? "Asetukset" : "Settings"}
                                    </p>
                                    {hasPermission("settings:users") && (
                                        <Link
                                            to="/settings/users"
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                                "hover:bg-primary/10 hover:text-primary",
                                                pathname === "/settings/users" ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400"
                                            )}
                                        >
                                            <span className="material-symbols-outlined text-2xl">manage_accounts</span>
                                            <span className="text-sm font-bold">
                                                {language === "fi" ? "Käyttäjät" : "Users"}
                                            </span>
                                        </Link>
                                    )}
                                    {hasPermission("settings:roles") && (
                                        <Link
                                            to="/settings/roles"
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                                "hover:bg-primary/10 hover:text-primary",
                                                pathname === "/settings/roles" ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400"
                                            )}
                                        >
                                            <span className="material-symbols-outlined text-2xl">shield_person</span>
                                            <span className="text-sm font-bold">
                                                {language === "fi" ? "Roolit" : "Roles"}
                                            </span>
                                        </Link>
                                    )}
                                    {hasPermission("settings:reimbursements") && (
                                        <Link
                                            to="/settings/reimbursements"
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                                "hover:bg-primary/10 hover:text-primary",
                                                pathname === "/settings/reimbursements" ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400"
                                            )}
                                        >
                                            <span className="material-symbols-outlined text-2xl">smart_toy</span>
                                            <span className="text-sm font-bold">
                                                {language === "fi" ? "Korvaukset" : "Reimbursements"}
                                            </span>
                                        </Link>
                                    )}
                                </div>
                            )}

                            {/* Profile section in mobile menu */}
                            {showProfileMenu && !isInfoReel && (
                                <div className="mt-4 pt-4 border-t border-border">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">
                                        {language === "fi" ? "Profiili" : "Profile"}
                                    </p>
                                    <Link
                                        to="/profile"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                            "hover:bg-primary/10 hover:text-primary",
                                            isProfileActive ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400"
                                        )}
                                    >
                                        <span className="material-symbols-outlined text-2xl">edit</span>
                                        <span className="text-sm font-bold">
                                            {language === "fi" ? "Muokkaa profiilia" : "Edit profile"}
                                        </span>
                                    </Link>
                                    <Link
                                        to="/auth/logout"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                                    >
                                        <span className="material-symbols-outlined text-2xl">logout</span>
                                        <span className="text-sm font-bold">
                                            {language === "fi" ? "Kirjaudu ulos" : "Log out"}
                                        </span>
                                    </Link>
                                </div>
                            )}
                        </nav>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Desktop: Original horizontal/vertical navigation */}
            <nav className={cn(
                "hidden md:flex items-center justify-center gap-1",
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
                                        <span className="text-sm md:text-base font-bold">
                                            {(language === "fi" || isInfoReel) ? item.label : item.subLabel}
                                        </span>
                                        {isInfoReel && (
                                            <span className="text-[10px] md:text-xs opacity-60 font-medium">{item.subLabel}</span>
                                        )}
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
                                {(language === "fi" || isInfoReel) ? (
                                    <>
                                        <span>{item.label}</span>
                                        {isInfoReel && <span className="text-muted-foreground ml-1">/ {item.subLabel}</span>}
                                    </>
                                ) : (
                                    <span>{item.subLabel}</span>
                                )}
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
                                    <span className="text-sm md:text-base font-bold">
                                        {(language === "fi" || isInfoReel) ? "Asetukset" : "Settings"}
                                    </span>
                                    {isInfoReel && (
                                        <span className="text-[10px] md:text-xs opacity-60 font-medium">Settings</span>
                                    )}
                                </div>

                                {/* Dropdown indicator */}
                                <span className="material-symbols-outlined text-sm opacity-60 hidden lg:block">
                                    expand_more
                                </span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {hasPermission("settings:users") && (
                                <DropdownMenuItem asChild>
                                    <Link to="/settings/users" className="flex items-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-lg">manage_accounts</span>
                                        <div>
                                            <p className="font-medium">
                                                {(language === "fi" || isInfoReel) ? "Käyttäjät" : "Users"}
                                            </p>
                                            {isInfoReel && <p className="text-xs text-muted-foreground">Users</p>}
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            {hasPermission("settings:roles") && (
                                <DropdownMenuItem asChild>
                                    <Link to="/settings/roles" className="flex items-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-lg">shield_person</span>
                                        <div>
                                            <p className="font-medium">
                                                {(language === "fi" || isInfoReel) ? "Roolit" : "Roles"}
                                            </p>
                                            {isInfoReel && <p className="text-xs text-muted-foreground">Roles</p>}
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            {hasPermission("settings:reimbursements") && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/settings/reimbursements" className="flex items-center gap-2 cursor-pointer">
                                            <span className="material-symbols-outlined text-lg">smart_toy</span>
                                            <div>
                                                <p className="font-medium">
                                                    {(language === "fi" || isInfoReel) ? "Korvaukset" : "Reimbursements"}
                                                </p>
                                                {isInfoReel && <p className="text-xs text-muted-foreground">Reimbursements</p>}
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
                                    <span className="text-sm md:text-base font-bold">
                                        {(language === "fi" || isInfoReel) ? "Profiili" : "Profile"}
                                    </span>
                                    {isInfoReel && (
                                        <span className="text-[10px] md:text-xs opacity-60 font-medium">Profile</span>
                                    )}
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
                                        <p className="font-medium">
                                            {(language === "fi" || isInfoReel) ? "Muokkaa profiilia" : "Edit profile"}
                                        </p>
                                        {isInfoReel && <p className="text-xs text-muted-foreground">Edit profile</p>}
                                    </div>
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild variant="destructive">
                                <Link to="/auth/logout" className="flex items-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined text-lg">logout</span>
                                    <div>
                                        <p className="font-medium">
                                            {(language === "fi" || isInfoReel) ? "Kirjaudu ulos" : "Log out"}
                                        </p>
                                        {isInfoReel && <p className="text-xs opacity-75">Log out</p>}
                                    </div>
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Language Switcher Desktop - Only show when not in info reel */}
                {!isInfoReel && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={toggleLanguage}
                                className={cn(
                                    "relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
                                    "hover:bg-primary/10 hover:text-primary cursor-pointer text-gray-500 dark:text-gray-400"
                                )}
                            >
                                <span className="relative material-symbols-outlined text-2xl md:text-3xl">
                                    translate
                                </span>

                                <div className={cn(
                                    "relative flex-col items-start leading-none hidden lg:flex",
                                    orientation === "vertical" && "lg:hidden"
                                )}>
                                    <span className="text-sm md:text-base font-bold">
                                        {language === "fi" ? "Suomi" : "English"}
                                    </span>
                                    <span className="text-[10px] md:text-xs opacity-60 font-medium">
                                        {language === "fi" ? "Kieli" : "Language"}
                                    </span>
                                </div>
                            </button>
                        </TooltipTrigger>
                        <TooltipContent
                            side={orientation === "vertical" ? "right" : "bottom"}
                            className={cn(
                                "font-bold",
                                orientation === "horizontal" && "lg:hidden"
                            )}
                        >
                            <span>{language === "fi" ? "Vaihda kieleksi englanti" : "Switch to Finnish"}</span>
                        </TooltipContent>
                    </Tooltip>
                )}
            </nav>
        </TooltipProvider>
    );
}
