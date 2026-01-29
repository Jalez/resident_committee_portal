import { XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useFetcher, useRevalidator } from "react-router";
import { LanguageSwitcher } from "~/components/language-switcher";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
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
import { useLanguage } from "~/contexts/language-context";
import { useUser } from "~/contexts/user-context";
import { NAV_ITEMS } from "~/lib/nav-config";
import { cn } from "~/lib/utils";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "~/root";

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
	const { primaryLanguage, secondaryLanguage, supportedLanguages, languageNames } = useLanguage();
	const { user, hasPermission, hasAnyPermission } = useUser();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [mobileMessagesOpen, setMobileMessagesOpen] = useState(false);
	const [mobileLanguageOpen, setMobileLanguageOpen] = useState(false);
	const { t, i18n } = useTranslation();
	const fetcher = useFetcher();
	const revalidator = useRevalidator();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const unreadMessageCount = rootData?.unreadMessageCount || 0;
	const unreadMessages = rootData?.unreadMessages || [];

	// Function to mark one or more messages as read
	const markMessagesAsRead = useCallback(
		async (messageIds: string[]) => {
			if (messageIds.length === 0) return;
			try {
				const response = await fetch("/api/messages/mark-read", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ messageIds }),
				});
				if (response.ok) {
					revalidator.revalidate();
				}
			} catch (error) {
				console.error("Failed to mark messages as read:", error);
			}
		},
		[revalidator],
	);



	// Check if profile menu should be shown (user is logged in, not guest)
	const showProfileMenu = user && user.userId !== "guest";

	// Check if settings menu should be shown (has any admin permissions)
	const showSettingsMenu =
		!isInfoReel &&
		hasAnyPermission([
			"settings:users",
			"settings:roles",
			"settings:reimbursements",
			"settings:analytics",
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
		// If InfoReel: Primary = user primary language, Secondary = user secondary language
		// If Normal: Primary = Current Language
		const primaryLabel = isInfoReel
			? t(item.i18nKey, { lng: primaryLanguage })
			: t(item.i18nKey);
		const secondaryLabel = t(item.i18nKey, { lng: secondaryLanguage });

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

	// Mobile menu label
	const mobileMenuLabel = isInfoReel
		? isHomePage
			? `${t("nav.menu", { lng: primaryLanguage })} / ${t("nav.menu", { lng: secondaryLanguage })}`
			: currentNavItem
				? `${t(currentNavItem.i18nKey, { lng: primaryLanguage })} / ${t(currentNavItem.i18nKey, { lng: secondaryLanguage })}`
				: `${t("nav.menu", { lng: primaryLanguage })} / ${t("nav.menu", { lng: secondaryLanguage })}`
		: isHomePage
			? t("nav.menu")
			: currentNavItem
				? t(currentNavItem.i18nKey)
				: t("nav.menu");

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
										{hasPermission("settings:analytics") && (
										<Link
											to="/settings/analytics"
											onClick={() => setMobileMenuOpen(false)}
											className={cn(
												"flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
												"hover:bg-primary/10 hover:text-primary",
												pathname === "/settings/analytics"
													? "text-primary bg-primary/10"
													: "text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												bar_chart
											</span>
											<span className="text-sm font-bold">
													{t("nav.analytics")}
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
									{/* Messages submenu in mobile menu */}
									<div>
										<button
											type="button"
											onClick={() => setMobileMessagesOpen(!mobileMessagesOpen)}
											className={cn(
												"flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative w-full text-left",
												"hover:bg-primary/10 hover:text-primary",
												pathname === "/messages"
													? "text-primary bg-primary/10"
													: "text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												mail
											</span>
											<span className="text-sm font-bold flex-1">
												{t("nav.messages")}
											</span>
											{unreadMessageCount > 0 && (
												<span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full">
													{unreadMessageCount > 99 ? "99+" : unreadMessageCount}
												</span>
											)}
											<span
												className={cn(
													"material-symbols-outlined text-lg transition-transform",
													mobileMessagesOpen && "rotate-90",
												)}
											>
												chevron_right
											</span>
										</button>
							{mobileMessagesOpen && (
											<div className="pl-4 space-y-1">
												{unreadMessages.length === 0 ? (
													<div className="px-4 py-2 text-sm text-muted-foreground">
														{t("messages.empty")}
													</div>
												) : (
													<>
														{unreadMessages.map((message) => (
															<div
																key={message.id}
																className="flex items-start gap-2 px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors"
															>
																<div className="min-w-0 flex-1 flex flex-col gap-1">
																	<p className="font-medium text-sm line-clamp-1">
																		{message.title}
																	</p>
																	<p className="text-xs text-muted-foreground line-clamp-2">
																		{message.content}
																	</p>
																	<p className="text-xs text-muted-foreground">
																		{new Date(message.createdAt).toLocaleDateString(
																			i18n.language === "fi" ? "fi-FI" : "en-US",
																			{
																				month: "short",
																				day: "numeric",
																				hour: "2-digit",
																				minute: "2-digit",
																			},
																		)}
																	</p>
																</div>
																<div className="flex flex-col items-end gap-1 shrink-0">
																	<Link
																		to="/messages"
																		onClick={() => setMobileMenuOpen(false)}
																		className="text-xs text-primary hover:underline"
																	>
																		{t("messages.view")}
																	</Link>
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		className="h-8 px-2 text-xs"
																		onClick={(e) => {
																			e.preventDefault();
																			markMessagesAsRead([message.id]);
																		}}
																	>
																		{t("messages.mark_as_read")}
																	</Button>
																</div>
															</div>
														))}
													</>
												)}
												{/* See all - always at bottom, matches desktop styling */}
												<div className="border-t border-border mt-2 pt-2">
													<Link
														to="/messages"
														onClick={() => setMobileMenuOpen(false)}
														className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg hover:bg-primary/10 text-primary text-sm font-medium transition-colors"
													>
														{t("messages.see_all")}
													</Link>
												</div>
											</div>
										)}
									</div>
									{/* Language Switcher Mobile - under profile when logged in */}
									<div>
										<button
											type="button"
											onClick={() => setMobileLanguageOpen(!mobileLanguageOpen)}
											className={cn(
												"flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left",
												"hover:bg-primary/10 hover:text-primary",
												"text-gray-500 dark:text-gray-400",
											)}
										>
											<span className="material-symbols-outlined text-2xl">
												translate
											</span>
											<span className="text-sm font-bold flex-1">
												{t("lang.label")}
											</span>
											<span
												className={cn(
													"material-symbols-outlined text-lg transition-transform",
													mobileLanguageOpen && "rotate-90",
												)}
											>
												chevron_right
											</span>
										</button>
										{mobileLanguageOpen && (
											<div className="pl-4 space-y-1">
												<div className="px-4 py-2">
													<p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
														{t("settings.general.primary_language")}
													</p>
													{supportedLanguages.map((lang) => (
														<button
															type="button"
															key={`primary-${lang}`}
															onClick={() => {
																i18n.changeLanguage(lang);
																fetcher.submit(
																	{ language: lang, type: "primary" },
																	{ method: "post", action: "/api/set-language" },
																);
															}}
															className={cn(
																"w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors text-sm",
																i18n.language === lang && "bg-primary/10 text-primary",
															)}
														>
															<span>{languageNames[lang] || lang}</span>
															{i18n.language === lang && (
																<span className="material-symbols-outlined text-sm">
																	check
																</span>
															)}
														</button>
													))}
												</div>
												<div className="px-4 py-2">
													<p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
														{t("settings.general.secondary_language")}
													</p>
													{supportedLanguages.map((lang) => (
														<button
															type="button"
															key={`secondary-${lang}`}
															onClick={() => {
																fetcher.submit(
																	{ language: lang, type: "secondary" },
																	{ method: "post", action: "/api/set-language" },
																);
																setTimeout(() => {
																	revalidator.revalidate();
																}, 100);
															}}
															className={cn(
																"w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors text-sm",
																secondaryLanguage === lang && "bg-primary/10 text-primary",
															)}
														>
															<span>{languageNames[lang] || lang}</span>
															{secondaryLanguage === lang && (
																<span className="material-symbols-outlined text-sm">
																	check
																</span>
															)}
														</button>
													))}
													<button
														type="button"
														key="secondary-none"
														onClick={() => {
															fetcher.submit(
																{ language: "none", type: "secondary" },
																{ method: "post", action: "/api/set-language" },
															);
															setTimeout(() => {
																revalidator.revalidate();
															}, 100);
														}}
														className={cn(
															"w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors text-sm",
															secondaryLanguage === "none" && "bg-primary/10 text-primary",
														)}
													>
														<span>{t("settings.common.none")}</span>
														{secondaryLanguage === "none" && (
															<span className="material-symbols-outlined text-sm">
																check
															</span>
														)}
													</button>
												</div>
											</div>
										)}
									</div>
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
							{/* Language Switcher Mobile - for guests */}
							{!showProfileMenu && !isInfoReel && (
								<LanguageSwitcher variant="standalone" />
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
						? t(item.i18nKey, { lng: primaryLanguage })
						: t(item.i18nKey);
					const secondaryLabel = t(item.i18nKey, { lng: secondaryLanguage });

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
										<span>{t(item.i18nKey, { lng: primaryLanguage })}</span>
										<span className="text-muted-foreground ml-1">
											/ {t(item.i18nKey, { lng: secondaryLanguage })}
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
							{hasPermission("settings:analytics") && (
								<DropdownMenuItem asChild>
									<Link
										to="/settings/analytics"
										className="flex items-center gap-2 cursor-pointer"
									>
										<span className="material-symbols-outlined text-lg">
											bar_chart
										</span>
										<div>
												<p className="font-medium">{t("nav.analytics")}</p>
										</div>
									</Link>
								</DropdownMenuItem>
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

								{/* Unread messages badge */}
								{unreadMessageCount > 0 && (
									<span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full">
										{unreadMessageCount > 99 ? "99+" : unreadMessageCount}
									</span>
								)}

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
							{/* Messages Submenu */}
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className="cursor-pointer relative">
									<span className="material-symbols-outlined text-lg">
										mail
									</span>
									<div className="flex-1">
										<Link to="/messages" className="font-medium block">{t("nav.messages")}</Link>
									</div>
									{unreadMessageCount > 0 && (
										<span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full mr-2">
											{unreadMessageCount > 99 ? "99+" : unreadMessageCount}
										</span>
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="w-80">
									<DropdownMenuLabel>
										{t("nav.messages")}
										{unreadMessageCount > 0 && (
											<span className="ml-2 text-xs text-muted-foreground">
												({t("messages.unread_count", { count: unreadMessageCount })})
											</span>
										)}
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{unreadMessages.length === 0 ? (
										<DropdownMenuItem disabled className="text-muted-foreground">
											{t("messages.empty")}
										</DropdownMenuItem>
									) : (
										<>
											{unreadMessages.map((message) => (
												<DropdownMenuItem
													key={message.id}
													className="flex flex-col items-start gap-1 py-3"
													onSelect={(e) => e.preventDefault()}
												>
													<div className="flex w-full items-start gap-2">
														<div className="min-w-0 flex-1">
															<p className="font-medium text-sm line-clamp-1">
																{message.title}
															</p>
															<p className="text-xs text-muted-foreground line-clamp-2">
																{message.content}
															</p>
															<p className="text-xs text-muted-foreground mt-1">
																{new Date(message.createdAt).toLocaleDateString(
																	i18n.language === "fi" ? "fi-FI" : "en-US",
																	{
																		month: "short",
																		day: "numeric",
																		hour: "2-digit",
																		minute: "2-digit",
																	},
																)}
															</p>
														</div>
														<div className="flex items-center gap-1 shrink-0">
															<Link
																to="/messages"
																onClick={(e) => e.stopPropagation()}
																className="text-xs text-primary hover:underline"
															>
																{t("messages.view")}
															</Link>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-8 px-2 text-xs"
																onClick={(e) => {
																	e.preventDefault();
																	e.stopPropagation();
																	markMessagesAsRead([message.id]);
																}}
															>
																{t("messages.mark_as_read")}
															</Button>
														</div>
													</div>
												</DropdownMenuItem>
											))}
												<>
													<DropdownMenuSeparator />
													<DropdownMenuItem asChild>
														<Link
															to="/messages"
															className="flex items-center justify-center gap-2 cursor-pointer text-primary"
														>
															<span className="text-sm font-medium">
																{t("messages.see_all")}
															</span>
														</Link>
													</DropdownMenuItem>
												</>
										</>
									)}
									{unreadMessageCount === 0 && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem asChild>
												<Link
													to="/messages"
													className="flex items-center justify-center gap-2 cursor-pointer"
												>
													<span className="text-sm font-medium">
														{t("messages.see_all")}
													</span>
												</Link>
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
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
					<LanguageSwitcher variant="standalone" className="w-auto" />
				)}
			</nav>
		</TooltipProvider>
	);
}
