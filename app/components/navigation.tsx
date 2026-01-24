import { XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { LanguageSwitcher } from "~/components/language-switcher";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { useInfoReel } from "~/contexts/info-reel-context";
import { useUser } from "~/contexts/user-context";
import { NAV_ITEMS } from "~/lib/nav-config";
import { cn } from "~/lib/utils";

interface NavigationProps {
	className?: string;
	orientation?: "vertical" | "horizontal";
}

export function Navigation({
	className,
	orientation = "vertical",
}: NavigationProps) {
	const location = useLocation();
	const pathname = location.pathname;
	const { isInfoReel, fillProgress, opacity } = useInfoReel();
	const { user, hasPermission, hasAnyPermission } = useUser();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const { t } = useTranslation();

	// Check if profile menu should be shown (user is logged in, not guest)
	const showProfileMenu = user && user.userId !== "guest";

	// Check if settings menu should be shown (has any admin permissions)
	const showSettingsMenu =
		!isInfoReel &&
		hasAnyPermission([
			"settings:users",
			"settings:roles",
			"settings:reimbursements",
			"settings:general",
		]);

	// Use shared nav items configuration
	const allNavItems = NAV_ITEMS;

	// Filter nav items based on permissions and info reel mode
	const navItems = allNavItems.filter((item) => {
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
	const renderNavItem = (item: (typeof navItems)[0], isMobile = false) => {
		const isActive = pathname === item.path;
		const isAnimating = isActive && isInfoReel;

		// Resolve labels
		// If InfoReel: Primary = FI, Secondary = EN
		// If Normal: Primary = Current Language
		const primaryLabel = isInfoReel
			? t(item.i18nKey, { lng: "fi" })
			: t(item.i18nKey);
		const secondaryLabel = t(item.i18nKey, { lng: "en" });

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
					isMobile && "w-full shrink-0",
				)}
				style={
					isAnimating
						? {
								color: `color-mix(in srgb, var(--primary) ${opacity * 100}%, var(--muted-foreground) ${(1 - opacity) * 100}%)`,
							}
						: undefined
				}
			>
				{/* Animated filling background for active item in info reel mode */}
				{isAnimating && (
					<div
						className="absolute inset-0 bg-primary/10"
						style={{
							clipPath: `inset(0 ${100 - fillProgress}% 0 0)`,
							opacity: opacity,
						}}
					/>
				)}

				<span className="relative material-symbols-outlined text-2xl">
					{item.icon}
				</span>

				{/* Always show labels in mobile menu */}
				{isMobile && (
					<div className="relative flex flex-col items-start leading-none">
						<span className="text-sm font-bold">{primaryLabel}</span>
						{isInfoReel && (
							<span className="text-xs opacity-60 font-medium">
								{secondaryLabel}
							</span>
						)}
					</div>
				)}
			</Link>
		);
	};

	// Get current page info for mobile menu button
	const currentNavItem =
		navItems.find((item) => item.path === pathname) ||
		allNavItems.find((item) => item.path === pathname);
	const isHomePage = pathname === "/";

	// Mobile menu label - originally showed "FI / EN" format
	// Refactoring to use translation keys
	const mobileMenuLabel = isHomePage
		? `${t("nav.menu", { lng: "fi" })} / ${t("nav.menu", { lng: "en" })}`
		: currentNavItem
			? `${t(currentNavItem.i18nKey, { lng: "fi" })} / ${t(currentNavItem.i18nKey, { lng: "en" })}`
			: `${t("nav.menu", { lng: "fi" })} / ${t("nav.menu", { lng: "en" })}`;

	const mobileMenuIcon = isHomePage ? "menu" : currentNavItem?.icon || "menu";

	return (
		<TooltipProvider delayDuration={200}>
			{/* Mobile: Hamburger menu button + Sheet */}
			<div className="md:hidden flex items-center justify-center w-full">
				<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
					<SheetTrigger asChild>
						<Button
							variant="ghost"
							className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-primary/10 hover:text-primary transition-all"
						>
							<span className="material-symbols-outlined text-2xl">
								{mobileMenuIcon}
							</span>
							<span className="text-sm font-bold">{mobileMenuLabel}</span>
							<span className="material-symbols-outlined text-lg opacity-60">
								expand_more
							</span>
						</Button>
					</SheetTrigger>
					<SheetContent
						side="left"
						className="w-80 h-full flex flex-col"
						showClose={false}
					>
						<SheetHeader className="shrink-0 flex flex-row items-center gap-2 space-y-0">
							<SheetClose className="p-1 rounded-md hover:bg-muted transition-colors">
								<XIcon className="size-5" />
								<span className="sr-only">Close</span>
							</SheetClose>
							<SheetTitle className="text-left text-lg font-black">
								{t("nav.navigation")}
							</SheetTitle>
						</SheetHeader>
						<nav className="flex flex-col gap-1 mt-4 overflow-y-auto min-h-0 flex-1 pb-8">
							{/* Language Switcher Mobile */}
							<LanguageSwitcher variant="standalone" />

							{navItems.map((item) => renderNavItem(item, true))}

							{/* Settings in mobile menu */}
							{showSettingsMenu && (
								<div className="mt-4 pt-4 border-t border-border">
									<p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">
										{t("nav.settings")}
									</p>
									{hasPermission("settings:general") && (
										<Link
											to="/settings/general"
											onClick={() => setMobileMenuOpen(false)}
											className={cn(
												"flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
												"hover:bg-primary/10 hover:text-primary",
												pathname === "/settings/general"
													? "text-primary bg-primary/10"
													: "text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												settings
											</span>
											<span className="text-sm font-bold">
												{t("settings.general.title")}
											</span>
										</Link>
									)}
									{hasPermission("settings:users") && (
										<Link
											to="/settings/users"
											onClick={() => setMobileMenuOpen(false)}
											className={cn(
												"flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
												"hover:bg-primary/10 hover:text-primary",
												pathname === "/settings/users"
													? "text-primary bg-primary/10"
													: "text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												manage_accounts
											</span>
											<span className="text-sm font-bold">
												{t("nav.users")}
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
												pathname === "/settings/roles"
													? "text-primary bg-primary/10"
													: "text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												shield_person
											</span>
											<span className="text-sm font-bold">
												{t("nav.roles")}
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
												pathname === "/settings/reimbursements"
													? "text-primary bg-primary/10"
													: "text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												smart_toy
											</span>
											<span className="text-sm font-bold">
												{t("nav.reimbursements")}
											</span>
										</Link>
									)}
								</div>
							)}

							{/* Profile section in mobile menu */}
							{showProfileMenu && !isInfoReel && (
								<div className="mt-4 pt-4 border-t border-border">
									<p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">
										{t("nav.profile")}
									</p>
									<Link
										to="/profile"
										onClick={() => setMobileMenuOpen(false)}
										className={cn(
											"flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
											"hover:bg-primary/10 hover:text-primary",
											isProfileActive
												? "text-primary bg-primary/10"
												: "text-gray-500 dark:text-gray-400",
										)}
									>
										<span className="material-symbols-outlined text-2xl">
											edit
										</span>
										<span className="text-sm font-bold">
											{t("nav.edit_profile")}
										</span>
									</Link>
									<Link
										to="/auth/logout"
										onClick={() => setMobileMenuOpen(false)}
										className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
									>
										<span className="material-symbols-outlined text-2xl">
											logout
										</span>
										<span className="text-sm font-bold">
											{t("nav.log_out")}
										</span>
									</Link>
								</div>
							)}
						</nav>
					</SheetContent>
				</Sheet>
			</div>

			{/* Desktop: Original horizontal/vertical navigation */}
			<nav
				className={cn(
					"hidden md:flex items-center justify-center gap-1",
					orientation === "vertical" ? "flex-col h-full" : "flex-row w-full",
					className,
				)}
			>
				{navItems.map((item) => {
					const isActive = pathname === item.path;
					const isAnimating = isActive && isInfoReel;
					const primaryLabel = isInfoReel
						? t(item.i18nKey, { lng: "fi" })
						: t(item.i18nKey);
					const secondaryLabel = t(item.i18nKey, { lng: "en" });

					return (
						<Tooltip key={item.path}>
							<TooltipTrigger asChild>
								<Link
									to={item.path}
									className={cn(
										"relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
										"hover:bg-primary/10 hover:text-primary",
										!isAnimating && isActive && "text-primary bg-primary/10",
										!isActive && "text-gray-500 dark:text-gray-400",
									)}
									style={
										isAnimating
											? {
													color: `color-mix(in srgb, var(--primary) ${opacity * 100}%, var(--muted-foreground) ${(1 - opacity) * 100}%)`,
												}
											: undefined
									}
								>
									{/* Animated filling background for active item in info reel mode */}
									{isAnimating && (
										<div
											className="absolute inset-0 bg-primary/10"
											style={{
												clipPath: `inset(0 ${100 - fillProgress}% 0 0)`,
												opacity: opacity,
											}}
										/>
									)}

									<span className="relative material-symbols-outlined text-2xl md:text-3xl">
										{item.icon}
									</span>

									<div
										className={cn(
											"relative flex-col items-start leading-none hidden lg:flex",
											orientation === "vertical" && "lg:hidden", // Hide even on large if vertical (uses sidebar tooltips)
										)}
									>
										<span className="text-sm md:text-base font-bold">
											{primaryLabel}
										</span>
										{isInfoReel && (
											<span className="text-[10px] md:text-xs opacity-60 font-medium">
												{secondaryLabel}
											</span>
										)}
									</div>
								</Link>
							</TooltipTrigger>
							<TooltipContent
								side={orientation === "vertical" ? "right" : "bottom"}
								className={cn(
									"font-bold",
									// Hide tooltip on large screens when horizontal (labels are visible)
									orientation === "horizontal" && "lg:hidden",
								)}
							>
								{isInfoReel ? (
									<>
										<span>{t(item.i18nKey, { lng: "fi" })}</span>
										<span className="text-muted-foreground ml-1">
											/ {t(item.i18nKey, { lng: "en" })}
										</span>
									</>
								) : (
									<span>{t(item.i18nKey)}</span>
								)}
							</TooltipContent>
						</Tooltip>
					);
				})}

				{/* Settings Dropdown Menu - Only show for admins */}
				{showSettingsMenu && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								className={cn(
									"relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
									"hover:bg-primary/10 hover:text-primary cursor-pointer",
									isSettingsActive
										? "text-primary bg-primary/10"
										: "text-gray-500 dark:text-gray-400",
								)}
							>
								<span className="relative material-symbols-outlined text-2xl md:text-3xl">
									settings
								</span>

								<div
									className={cn(
										"relative flex-col items-start leading-none hidden lg:flex",
										orientation === "vertical" && "lg:hidden",
									)}
								>
									<span className="text-sm md:text-base font-bold">
										{t("nav.settings")}
									</span>
								</div>

								{/* Dropdown indicator */}
								<span className="material-symbols-outlined text-sm opacity-60 hidden lg:block">
									expand_more
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							{hasPermission("settings:general") && (
								<DropdownMenuItem asChild>
									<Link
										to="/settings/general"
										className="flex items-center gap-2 cursor-pointer"
									>
										<span className="material-symbols-outlined text-lg">
											settings
										</span>
										<div>
											<p className="font-medium">
												{t("settings.general.title")}
											</p>
										</div>
									</Link>
								</DropdownMenuItem>
							)}
							{hasPermission("settings:users") && (
								<DropdownMenuItem asChild>
									<Link
										to="/settings/users"
										className="flex items-center gap-2 cursor-pointer"
									>
										<span className="material-symbols-outlined text-lg">
											manage_accounts
										</span>
										<div>
											<p className="font-medium">{t("nav.users")}</p>
										</div>
									</Link>
								</DropdownMenuItem>
							)}
							{hasPermission("settings:roles") && (
								<DropdownMenuItem asChild>
									<Link
										to="/settings/roles"
										className="flex items-center gap-2 cursor-pointer"
									>
										<span className="material-symbols-outlined text-lg">
											shield_person
										</span>
										<div>
											<p className="font-medium">{t("nav.roles")}</p>
										</div>
									</Link>
								</DropdownMenuItem>
							)}
							{hasPermission("settings:reimbursements") && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<Link
											to="/settings/reimbursements"
											className="flex items-center gap-2 cursor-pointer"
										>
											<span className="material-symbols-outlined text-lg">
												smart_toy
											</span>
											<div>
												<p className="font-medium">{t("nav.reimbursements")}</p>
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
							<Button
								variant="ghost"
								className={cn(
									"relative group flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-2 rounded-xl transition-all duration-300 overflow-hidden",
									"hover:bg-primary/10 hover:text-primary cursor-pointer",
									isProfileActive
										? "text-primary bg-primary/10"
										: "text-gray-500 dark:text-gray-400",
								)}
							>
								<span className="relative material-symbols-outlined text-2xl md:text-3xl">
									person
								</span>

								<div
									className={cn(
										"relative flex-col items-start leading-none hidden lg:flex",
										orientation === "vertical" && "lg:hidden",
									)}
								>
									<span className="text-sm md:text-base font-bold">
										{t("nav.profile")}
									</span>
								</div>

								{/* Dropdown indicator */}
								<span className="material-symbols-outlined text-sm opacity-60 hidden lg:block">
									expand_more
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuItem asChild>
								<Link
									to="/profile"
									className="flex items-center gap-2 cursor-pointer"
								>
									<span className="material-symbols-outlined text-lg">
										edit
									</span>
									<div>
										<p className="font-medium">{t("nav.edit_profile")}</p>
									</div>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<LanguageSwitcher variant="submenu" />
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild variant="destructive">
								<Link
									to="/auth/logout"
									className="flex items-center gap-2 cursor-pointer"
								>
									<span className="material-symbols-outlined text-lg">
										logout
									</span>
									<div>
										<p className="font-medium">{t("nav.log_out")}</p>
									</div>
								</Link>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				{/* Language Switcher for guests (not logged in) */}
				{!showProfileMenu && !isInfoReel && (
					<LanguageSwitcher variant="standalone" />
				)}
			</nav>
		</TooltipProvider>
	);
}
