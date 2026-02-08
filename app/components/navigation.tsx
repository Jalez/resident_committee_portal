import { XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useFetcher, useRevalidator } from "react-router";
import { LanguageSwitcher } from "~/components/language-switcher";
import { Button } from "~/components/ui/button";
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

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

interface NavigationProps {
	variant: "mobile" | "sidebar";
}

export function Navigation({ variant }: NavigationProps) {
	const location = useLocation();
	const pathname = location.pathname;
	const { isInfoReel, fillProgress, opacity } = useInfoReel();
	const { primaryLanguage, secondaryLanguage, supportedLanguages, languageNames } = useLanguage();
	const { user, hasPermission, hasAnyPermission } = useUser();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [mobileMessagesOpen, setMobileMessagesOpen] = useState(false);
	const [mobileLanguageOpen, setMobileLanguageOpen] = useState(false);
	const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});
	useEffect(() => {
		const parent = NAV_ITEMS.find(
			(i) => i.children?.length && pathname.startsWith(i.path),
		);
		if (parent) {
			setOpenSubmenus((prev) => ({ ...prev, [parent.path]: true }));
		}
	}, [pathname]);
	const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

	useEffect(() => {
		try {
			const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
			if (isCollapsed) {
				setSidebarCollapsedState(true);
			}
		} catch {
			// ignore
		}
	}, []);
	const setSidebarCollapsed = useCallback((value: boolean) => {
		setSidebarCollapsedState(value);
		try {
			localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "true" : "false");
		} catch {
			// ignore
		}
	}, []);
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
			"settings:news",
			"settings:faqs",
			"settings:general",
			"settings:receipts",
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

	// Shared nav item renderer (showLabels + onNavigate for both mobile sheet and sidebar)
	const renderNavItem = (
		item: (typeof navItems)[0],
		showLabels: boolean,
		onNavigate?: () => void,
	) => {
		const isActive = pathname === item.path;
		const isAnimating = isActive && isInfoReel;
		const primaryLabel = isInfoReel
			? t(item.i18nKey, { lng: primaryLanguage })
			: t(item.i18nKey);
		const secondaryLabel = t(item.i18nKey, { lng: secondaryLanguage });

		const link = (
			<Link
				key={item.path}
				to={item.path}
				onClick={onNavigate}
				className={cn(
					"relative group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 overflow-hidden w-full shrink-0",
					"hover:bg-primary/10 hover:text-primary",
					!isAnimating && isActive && "text-primary bg-primary/10",
					!isActive && "text-gray-500 dark:text-gray-400",
					!showLabels && "justify-center px-3",
				)}
				style={
					isAnimating
						? {
							color: `color-mix(in srgb, var(--primary) ${opacity * 100}%, var(--muted-foreground) ${(1 - opacity) * 100}%)`,
						}
						: undefined
				}
			>
				{isAnimating && (
					<div
						className="absolute inset-0 bg-primary/10"
						style={{
							clipPath: `inset(0 ${100 - fillProgress}% 0 0)`,
							opacity: opacity,
						}}
					/>
				)}
				<span className="relative material-symbols-outlined text-2xl shrink-0">
					{item.icon}
				</span>
				{showLabels && (
					<div className="relative flex flex-col items-start leading-none min-w-0">
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
		return link;
	};

	// Shared menu link for settings/profile (icon + optional label, optional tooltip when collapsed)
	const renderMenuLink = (
		to: string,
		icon: string,
		label: string,
		isActive: boolean,
		showLabels: boolean,
		onNavigate?: () => void,
		destructive?: boolean,
	) => {
		const link = (
			<Link
				to={to}
				onClick={onNavigate}
				className={cn(
					"flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full shrink-0",
					"hover:bg-primary/10 hover:text-primary",
					isActive ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400",
					!showLabels && "justify-center px-3",
					destructive &&
					"hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400",
				)}
			>
				<span className="material-symbols-outlined text-2xl shrink-0">{icon}</span>
				{showLabels && <span className="text-sm font-bold">{label}</span>}
			</Link>
		);
		if (!showLabels) {
			return (
				<Tooltip key={to}>
					<TooltipTrigger asChild>{link}</TooltipTrigger>
					<TooltipContent side="right">{label}</TooltipContent>
				</Tooltip>
			);
		}
		return link;
	};

	// Child active state: mail uses path+search, others use path prefix
	const search = typeof location.search === "string" ? location.search : "";
	const searchParams = new URLSearchParams(search);
	const isChildActive = (parentPath: string, childPath: string) => {
		if (parentPath === "/mail") {
			if (childPath === "/mail/drafts") return pathname === "/mail/drafts";
			if (childPath === "/mail?direction=sent")
				return pathname === "/mail" && searchParams.get("direction") === "sent";
			if (childPath === "/mail?compose=new")
				return pathname === "/mail" && !!searchParams.get("compose");
			if (childPath === "/mail")
				return pathname === "/mail" && searchParams.get("direction") !== "sent" && !searchParams.get("compose");
			return false;
		}
		// Index/overview child (same path as parent): only active on exact match
		if (childPath === parentPath) {
			return pathname === childPath;
		}
		return pathname === childPath || pathname.startsWith(childPath + "/");
	};

	// Shared menu content used by both mobile Sheet and desktop sidebar
	const renderMenuContent = (showLabels: boolean, onNavigate?: () => void) => (
		<>
			{navItems.map((item) => {
				// Items with children: render as expandable sub-items
				if (item.children?.length) {
					const isParentActive = pathname.startsWith(item.path);
					const isOpen = openSubmenus[item.path];
					if (!showLabels) {
						// Collapsed sidebar: single link to parent (first child)
						const link = (
							<Link
								key={item.path}
								to={item.path}
								onClick={onNavigate}
								className={cn(
									"relative group flex items-center justify-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 overflow-hidden w-full shrink-0",
									"hover:bg-primary/10 hover:text-primary",
									isParentActive && "text-primary bg-primary/10",
									!isParentActive && "text-gray-500 dark:text-gray-400",
								)}
							>
								<span className="material-symbols-outlined text-2xl shrink-0">
									{item.icon}
								</span>
							</Link>
						);
						return (
							<Tooltip key={item.path}>
								<TooltipTrigger asChild>{link}</TooltipTrigger>
								<TooltipContent side="right">
									{isInfoReel ? t(item.i18nKey, { lng: primaryLanguage }) : t(item.i18nKey)}
								</TooltipContent>
							</Tooltip>
						);
					}
					// Expanded: parent toggle + children
					return (
						<div key={item.path}>
							<button
								type="button"
								onClick={() =>
									setOpenSubmenus((prev) => ({
										...prev,
										[item.path]: !prev[item.path],
									}))
								}
								className={cn(
									"flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative w-full text-left",
									"hover:bg-primary/10 hover:text-primary",
									isParentActive ? "text-primary bg-primary/10" : "text-gray-500 dark:text-gray-400",
								)}
							>
								<span className="material-symbols-outlined text-2xl shrink-0">
									{item.icon}
								</span>
								<span className="text-sm font-bold flex-1">
									{isInfoReel ? t(item.i18nKey, { lng: primaryLanguage }) : t(item.i18nKey)}
								</span>
								<span
									className={cn(
										"material-symbols-outlined text-lg transition-transform shrink-0",
										isOpen && "rotate-90",
									)}
								>
									chevron_right
								</span>
							</button>
							{isOpen && (
								<div className="pl-4 space-y-0.5 mt-0.5">
									{item.children
										.filter((child) => !child.permission || hasPermission(child.permission))
										.map((child) => (
											<Link
												key={child.path}
												to={child.path}
												onClick={onNavigate}
												className={cn(
													"flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm w-full",
													"hover:bg-primary/10 hover:text-primary",
													isChildActive(item.path, child.path)
														? "text-primary bg-primary/10 font-medium"
														: "text-gray-500 dark:text-gray-400",
												)}
											>
												<span className="material-symbols-outlined text-xl shrink-0">
													{child.icon}
												</span>
												<span className="font-medium">
													{t(child.i18nKey)}
												</span>
											</Link>
										))}
								</div>
							)}
						</div>
					);
				}

				const itemEl = renderNavItem(item, showLabels, onNavigate);
				if (!showLabels) {
					const label = isInfoReel
						? t(item.i18nKey, { lng: primaryLanguage })
						: t(item.i18nKey);
					return (
						<Tooltip key={item.path}>
							<TooltipTrigger asChild>{itemEl}</TooltipTrigger>
							<TooltipContent side="right">{label}</TooltipContent>
						</Tooltip>
					);
				}
				return itemEl;
			})}

			{showSettingsMenu && (
				<div className={cn("mt-4 pt-4 border-t border-border", !showLabels && "mt-2 pt-2")}>
					{showLabels && (
						<p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">
							{t("nav.settings")}
						</p>
					)}
					{hasPermission("settings:general") &&
						renderMenuLink(
							"/settings/general",
							"settings",
							t("settings.general.title"),
							pathname === "/settings/general",
							showLabels,
							onNavigate,
						)}
					{hasPermission("settings:users") &&
						renderMenuLink(
							"/settings/users",
							"manage_accounts",
							t("nav.users"),
							pathname === "/settings/users",
							showLabels,
							onNavigate,
						)}
					{hasPermission("settings:roles") &&
						renderMenuLink(
							"/settings/roles",
							"shield_person",
							t("nav.roles"),
							pathname === "/settings/roles",
							showLabels,
							onNavigate,
						)}
					{hasPermission("settings:reimbursements") &&
						renderMenuLink(
							"/settings/reimbursements",
							"smart_toy",
							t("nav.reimbursements"),
							pathname === "/settings/reimbursements",
							showLabels,
							onNavigate,
						)}
					{hasPermission("settings:analytics") &&
						renderMenuLink(
							"/settings/analytics",
							"bar_chart",
							t("nav.analytics"),
							pathname === "/settings/analytics",
							showLabels,
							onNavigate,
						)}
					{hasPermission("settings:news") &&
						renderMenuLink(
							"/settings/news",
							"article",
							t("nav.news"),
							pathname === "/settings/news",
							showLabels,
							onNavigate,
						)}
					{hasPermission("settings:faqs") &&
						renderMenuLink(
							"/settings/faqs",
							"help",
							t("nav.faq"),
							pathname === "/settings/faqs",
							showLabels,
							onNavigate,
						)}

					{hasPermission("settings:receipts") &&
						renderMenuLink(
							"/settings/receipts",
							"receipt_long",
							t("settings.receipt_ocr_title", { defaultValue: "Receipt OCR" }),
							pathname === "/settings/receipts",
							showLabels,
							onNavigate,
						)}
				</div>
			)}

			{showProfileMenu && !isInfoReel && (
				<div className={cn("mt-4 pt-4 border-t border-border", !showLabels && "mt-2 pt-2")}>
					{showLabels && (
						<p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">
							{t("nav.profile")}
						</p>
					)}
					{renderMenuLink(
						"/profile",
						"edit",
						t("nav.edit_profile"),
						isProfileActive,
						showLabels,
						onNavigate,
					)}
					{showLabels ? (
						<>
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
									<span className="material-symbols-outlined text-2xl">mail</span>
									<span className="text-sm font-bold flex-1">{t("nav.messages")}</span>
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
														className="flex items-start gap-3 px-4 py-3 rounded-lg hover:bg-primary/5 transition-colors"
													>
														<div className="min-w-0 flex-1 flex flex-col gap-1.5">
															<p className="font-medium text-sm line-clamp-1">
																{message.title}
															</p>
															<p className="text-xs text-muted-foreground line-clamp-3">
																{message.content}
															</p>
															<p className="text-xs text-muted-foreground mt-0.5">
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
														<div className="flex flex-col items-end gap-2 shrink-0">
															{message.relatedNewsId && (
																<Link
																	to={`/news/${message.relatedNewsId}/edit`}
																	onClick={onNavigate}
																	className="text-xs text-primary hover:underline whitespace-nowrap"
																>
																	{t("messages.view_news")}
																</Link>
															)}
															<Button
																type="button"
																variant="outline"
																size="sm"
																className="h-8 px-2 text-xs flex items-center gap-1 shrink-0"
																onClick={(e) => {
																	e.preventDefault();
																	markMessagesAsRead([message.id]);
																}}
															>
																<span className="material-symbols-outlined text-base">
																	done
																</span>
																{t("messages.mark_as_read")}
															</Button>
														</div>
													</div>
												))}
												<div className="border-t border-border mt-2 pt-2">
													<Link
														to="/messages"
														onClick={onNavigate}
														className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg hover:bg-primary/10 text-primary text-sm font-medium transition-colors"
													>
														{t("messages.see_all")}
													</Link>
												</div>
											</>
										)}
									</div>
								)}
							</div>
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
									<span className="material-symbols-outlined text-2xl">translate</span>
									<span className="text-sm font-bold flex-1">{t("lang.label")}</span>
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
														setTimeout(() => revalidator.revalidate(), 100);
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
													setTimeout(() => revalidator.revalidate(), 100);
												}}
												className={cn(
													"w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors text-sm",
													secondaryLanguage === "none" && "bg-primary/10 text-primary",
												)}
											>
												<span>{t("common.fields.none")}</span>
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
							{renderMenuLink(
								"/auth/logout",
								"logout",
								t("nav.log_out"),
								false,
								true,
								onNavigate,
								true,
							)}
						</>
					) : (
						<>
							{renderMenuLink(
								"/messages",
								"mail",
								t("nav.messages"),
								pathname === "/messages",
								false,
								onNavigate,
							)}
							<Tooltip>
								<TooltipTrigger asChild>
									<div className="flex">
										<LanguageSwitcher variant="standalone" compact />
									</div>
								</TooltipTrigger>
								<TooltipContent side="right">{t("lang.label")}</TooltipContent>
							</Tooltip>
							{renderMenuLink(
								"/auth/logout",
								"logout",
								t("nav.log_out"),
								false,
								false,
								onNavigate,
								true,
							)}
						</>
					)}
				</div>
			)}
			{!showProfileMenu && !isInfoReel && showLabels && (
				<LanguageSwitcher variant="standalone" />
			)}
			{!showProfileMenu && !isInfoReel && !showLabels && (
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="mt-2 flex">
							<LanguageSwitcher variant="standalone" compact />
						</div>
					</TooltipTrigger>
					<TooltipContent side="right">{t("lang.label")}</TooltipContent>
				</Tooltip>
			)}
		</>
	);

	// Get current page info for mobile menu button
	const currentNavItem =
		navItems.find((item) => item.path === pathname) ||
		allNavItems.find((item) => item.path === pathname);
	const isHomePage = pathname === "/";

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

	if (variant === "mobile") {
		return (
			<TooltipProvider delayDuration={200}>
				<div className="flex items-center justify-center w-full">
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
								{renderMenuContent(true, () => setMobileMenuOpen(false))}
							</nav>
						</SheetContent>
					</Sheet>
				</div>
			</TooltipProvider>
		);
	}

	// Sidebar variant: persistent left sidebar, collapsible, same look as mobile menu
	return (
		<TooltipProvider delayDuration={200}>
			<aside
				className={cn(
					"hidden md:flex flex-col shrink-0 sticky top-0 h-screen border-r border-border bg-background transition-[width] duration-200 overflow-hidden z-40",
					sidebarCollapsed ? "w-[4.5rem]" : "w-80",
				)}
			>
				<div className="flex flex-col flex-1 min-h-0">
					<div className="shrink-0 flex items-center justify-between gap-2 px-3 py-3 border-b border-border">
						{!sidebarCollapsed && (
							<span className="text-lg font-black truncate">
								{t("nav.navigation")}
							</span>
						)}
						<Button
							variant="ghost"
							size="icon"
							className="shrink-0 rounded-xl"
							onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
							aria-label={
								sidebarCollapsed
									? t("nav.sidebar_expand")
									: t("nav.sidebar_collapse")
							}
						>
							<span
								className={cn(
									"material-symbols-outlined text-2xl transition-transform",
									sidebarCollapsed ? "rotate-180" : "",
								)}
							>
								chevron_left
							</span>
						</Button>
					</div>
					<nav className="flex flex-col gap-1 mt-2 overflow-y-auto min-h-0 flex-1 pb-4 px-2">
						{renderMenuContent(!sidebarCollapsed)}
					</nav>
				</div>
			</aside>
		</TooltipProvider>
	);
}
