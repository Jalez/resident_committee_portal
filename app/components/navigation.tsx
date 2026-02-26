import { XIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	useFetcher,
	useLocation,
	useRevalidator,
	useRouteLoaderData,
} from "react-router";
import { LanguageSwitcher } from "~/components/language-switcher";
import { ThemeSwitcher } from "~/components/theme-switcher";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import type { loader as rootLoader } from "~/root";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

interface NavigationProps {
	variant: "mobile" | "sidebar";
}

function CollapsedDropdownTrigger({
	icon,
	label,
	isActive = false,
}: {
	icon: string;
	label: string;
	isActive?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						className={cn(
							"group relative flex items-center justify-center px-3 py-2 rounded-xl transition-all w-full",
							"hover:bg-primary/10 hover:text-primary",
							isActive
								? "text-primary bg-primary/10"
								: "text-gray-500 dark:text-gray-400",
						)}
					>
						<span className="material-symbols-outlined text-2xl shrink-0 transition-transform duration-150 group-hover:-translate-x-1.5">
							{icon}
						</span>
						<span className="material-symbols-outlined pointer-events-none absolute right-1 text-base opacity-0 -translate-x-3 transition-all duration-150 group-hover:opacity-70 group-hover:translate-x-0">
							chevron_right
						</span>
					</Button>
				</DropdownMenuTrigger>
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}

export function Navigation({ variant }: NavigationProps) {
	const location = useLocation();
	const pathname = location.pathname;
	const { isInfoReel, fillProgress, opacity } = useInfoReel();
	const {
		primaryLanguage,
		secondaryLanguage,
		supportedLanguages,
		languageNames,
	} = useLanguage();
	const { user, hasPermission, hasAnyPermission } = useUser();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [mobileMessagesOpen, setMobileMessagesOpen] = useState(false);
	const [mobileLanguageOpen, setMobileLanguageOpen] = useState(false);
	const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
	const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
			const isCollapsed =
				localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
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
			"settings:relationship-context",
		]);

	// Use shared nav items configuration
	const allNavItems = NAV_ITEMS;

	// Filter nav items based on permissions and info reel mode
	const navItems = allNavItems.filter((item) => {
		// During info reel: only hide login/logout items, show permitted routes
		if (isInfoReel && item.showWhen) return false;

		// Login item is shown in the bottom section, not the main nav
		if (item.showWhen === "logged-out") return false;

		// Always show items without conditions
		if (!item.showWhen && !item.permission) return true;

		// Handle permission-based visibility
		if (item.permission) {
			return hasPermission(item.permission);
		}

		return true;
	});

	// Show login in bottom section for guests
	const showLoginButton = !isInfoReel && (!user || user.userId === "guest");

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
				prefetch="intent"
				className={cn(
					"relative group flex items-center gap-3 px-2 py-2 rounded-xl transition-all duration-300 overflow-hidden w-full shrink-0",
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

	type CollapsibleMenuItem = {
		to?: string;
		icon: string;
		label: string;
		show: boolean;
		destructive?: boolean;
		customRender?: (
			showLabels: boolean,
			onNavigate?: () => void,
			inDropdown?: boolean,
		) => React.ReactNode;
	};

	const renderCollapsibleMenu = (
		id: string,
		icon: string,
		label: string,
		isOpen: boolean,
		setIsOpen: (open: boolean) => void,
		items: CollapsibleMenuItem[],
		showLabels: boolean,
		onNavigate?: () => void,
	) => {
		const visibleItems = items.filter((item) => item.show);
		if (visibleItems.length === 0) return null;

		if (!showLabels) {
			return (
				<DropdownMenu key={id}>
					<CollapsedDropdownTrigger icon={icon} label={label} />
					<DropdownMenuContent side="right" align="start" className="w-56">
						{visibleItems.map((item) => {
							if (item.customRender) {
								return (
									<Fragment key={`custom-${item.icon}-${item.label}`}>
										{item.customRender(true, onNavigate, true)}
									</Fragment>
								);
							}
							if (!item.to) return null;
							return (
								<DropdownMenuItem
									key={item.to}
									asChild
									variant={item.destructive ? "destructive" : "default"}
									className={cn(
										pathname === item.to && "bg-primary/10 text-primary",
									)}
								>
									<Link
										to={item.to}
										onClick={onNavigate}
										prefetch={item.to === "/auth/logout" ? "none" : "intent"}
									>
										<span className="material-symbols-outlined text-lg shrink-0">
											{item.icon}
										</span>
										<span className="font-medium">{item.label}</span>
									</Link>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		const trigger = (
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex items-center gap-3 px-2 py-2 rounded-xl transition-all w-full text-left",
					"hover:bg-primary/10 hover:text-primary",
					"text-gray-500 dark:text-gray-400",
					!showLabels && "justify-center px-3",
				)}
			>
				<span className="material-symbols-outlined text-2xl shrink-0">
					{icon}
				</span>
				{showLabels && (
					<>
						<span className="text-sm font-bold flex-1">{label}</span>
						<span
							className={cn(
								"material-symbols-outlined text-lg transition-transform",
								isOpen && "rotate-90",
							)}
						>
							chevron_right
						</span>
					</>
				)}
			</button>
		);

		const content = isOpen && (
			<div className={cn("space-y-1", showLabels ? "pl-4" : "mt-1")}>
				{visibleItems.map((item) => {
					if (item.customRender) {
						return (
							<div key={`custom-${item.icon}-${item.label}`}>
								{item.customRender(showLabels, onNavigate, false)}
							</div>
						);
					}
					if (item.to) {
						return renderMenuLink(
							item.to,
							item.icon,
							item.label,
							pathname === item.to,
							showLabels,
							onNavigate,
							item.destructive,
						);
					}
					return null;
				})}
			</div>
		);

		return (
			<div className="flex flex-col">
				{trigger}
				{content}
			</div>
		);
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
				prefetch={to === "/auth/logout" ? "none" : "intent"}
				className={cn(
					"flex items-center gap-3 px-2 py-2 rounded-xl transition-all w-full shrink-0",
					"hover:bg-primary/10 hover:text-primary",
					isActive
						? "text-primary bg-primary/10"
						: "text-gray-500 dark:text-gray-400",
					!showLabels && "justify-center px-3",
					destructive &&
					"hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400",
				)}
			>
				<span className="material-symbols-outlined text-2xl shrink-0">
					{icon}
				</span>
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

	// Child active state for sub-navigation links.
	const isChildActive = (parentPath: string, childPath: string) => {
		if (parentPath === "/mail") {
			if (childPath === "/mail/received")
				return pathname === "/mail/received" || pathname === "/mail/inbox";
			if (childPath === "/mail/drafts") return pathname === "/mail/drafts";
			if (childPath === "/mail/sent") return pathname === "/mail/sent";
			if (childPath === "/mail/compose")
				return pathname.startsWith("/mail/compose");
			return false;
		}
		// Index/overview child (same path as parent): only active on exact match
		if (childPath === parentPath) {
			return pathname === childPath;
		}
		return pathname === childPath || pathname.startsWith(`${childPath}/`);
	};

	// Main nav items (scrollable)
	const renderMainNavItems = (showLabels: boolean, onNavigate?: () => void) => (
		<>
			{navItems.map((item) => {
				// Items with children: render as expandable sub-items
				if (item.children?.length) {
					const isParentActive = pathname.startsWith(item.path);
					const isOpen = openSubmenus[item.path];
					if (!showLabels) {
						const visibleChildren = item.children.filter(
							(child) => !child.permission || hasPermission(child.permission),
						);
						if (visibleChildren.length === 0) {
							return null;
						}
						const label = isInfoReel
							? t(item.i18nKey, { lng: primaryLanguage })
							: t(item.i18nKey);
						const trigger = (
							<DropdownMenu>
								<CollapsedDropdownTrigger
									icon={item.icon}
									label={label}
									isActive={isParentActive}
								/>
								<DropdownMenuContent side="right" align="start" className="w-56">
									{visibleChildren.map((child) => (
										<DropdownMenuItem
											key={child.path}
											asChild
											className={cn(
												isChildActive(item.path, child.path) &&
													"bg-primary/10 text-primary",
											)}
										>
											<Link to={child.path} onClick={onNavigate} prefetch="intent">
												<span className="material-symbols-outlined text-lg shrink-0">
													{child.icon}
												</span>
												<span className="font-medium">{t(child.i18nKey)}</span>
											</Link>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						);
						return <Fragment key={item.path}>{trigger}</Fragment>;
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
									"flex items-center gap-3 px-2 py-2 rounded-xl transition-all relative w-full text-left",
									"hover:bg-primary/10 hover:text-primary",
									isParentActive
										? "text-primary bg-primary/10"
										: "text-gray-500 dark:text-gray-400",
								)}
							>
								<span className="material-symbols-outlined text-2xl shrink-0">
									{item.icon}
								</span>
								<span className="text-sm font-bold flex-1">
									{isInfoReel
										? t(item.i18nKey, { lng: primaryLanguage })
										: t(item.i18nKey)}
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
										.filter(
											(child) =>
												!child.permission || hasPermission(child.permission),
										)
										.map((child) => (
											<Link
												key={child.path}
												to={child.path}
												onClick={onNavigate}
												prefetch="intent"
												className={cn(
													"flex items-center gap-3 px-2 py-2 rounded-lg transition-all text-sm w-full",
													"hover:bg-primary/10 hover:text-primary",
													isChildActive(item.path, child.path)
														? "text-primary bg-primary/10 font-medium"
														: "text-gray-500 dark:text-gray-400",
												)}
											>
												<span className="material-symbols-outlined text-xl shrink-0">
													{child.icon}
												</span>
												<span className="font-medium">{t(child.i18nKey)}</span>
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
		</>
	);

	// Bottom section (settings/profile) - fixed at bottom
	const renderBottomSection = (
		showLabels: boolean,
		onNavigate?: () => void,
	) => (
		<>
			{showSettingsMenu && (
				<div
					className={cn("pt-4 border-t border-border", !showLabels && "pt-2")}
				>
					{renderCollapsibleMenu(
						"settings",
						"settings",
						t("nav.settings"),
						settingsMenuOpen,
						setSettingsMenuOpen,
						[
							{
								to: "/settings/general",
								icon: "tune",
								label: t("settings.general.title"),
								show: hasPermission("settings:general"),
							},
							{
								to: "/settings/users",
								icon: "manage_accounts",
								label: t("nav.users"),
								show: hasPermission("settings:users"),
							},
							{
								to: "/settings/roles",
								icon: "shield_person",
								label: t("nav.roles"),
								show: hasPermission("settings:roles"),
							},
							{
								to: "/settings/reimbursements",
								icon: "smart_toy",
								label: t("nav.reimbursements"),
								show: hasPermission("settings:reimbursements"),
							},
							{
								to: "/settings/analytics",
								icon: "bar_chart",
								label: t("nav.analytics"),
								show: hasPermission("settings:analytics"),
							},
							{
								to: "/settings/receipts",
								icon: "receipt_long",
								label: t("settings.receipt_ocr_title", {
									defaultValue: "Receipt OCR",
								}),
								show: hasPermission("settings:receipts"),
							},
							{
								to: "/settings/auto-input",
								icon: "auto_awesome",
								label: t("nav.auto_input", {
									defaultValue: "Auto Input",
								}),
								show: hasPermission("settings:relationship-context"),
							},
						],
						showLabels,
						onNavigate,
					)}
				</div>
			)}

			{showProfileMenu && !isInfoReel && (
				<div
					className={cn("pt-4 border-t border-border", !showLabels && "pt-2")}
				>
					{renderCollapsibleMenu(
						"profile",
						"account_circle",
						t("nav.profile"),
						profileMenuOpen,
						setProfileMenuOpen,
						[
							{
								to: "/profile",
								icon: "edit",
								label: t("nav.edit_profile"),
								show: true,
							},
							{
								to: "/messages",
								icon: "mail",
								label: t("nav.messages"),
								show: true,
							},
							{
								icon: "dark_mode",
								label: t("theme.label"),
								show: true,
								customRender: (showLabels, _onNavigate, inDropdown) =>
									inDropdown ? (
										<ThemeSwitcher variant="submenu" />
									) : showLabels ? (
										<ThemeSwitcher variant="standalone" />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="flex">
													<ThemeSwitcher compact />
												</div>
											</TooltipTrigger>
											<TooltipContent side="right">
												{t("theme.label")}
											</TooltipContent>
										</Tooltip>
									),
							},
							{
								icon: "language",
								label: t("lang.label"),
								show: true,
								customRender: (showLabels, _onNavigate, inDropdown) =>
									inDropdown ? (
										<LanguageSwitcher variant="submenu" />
									) : showLabels ? (
										<LanguageSwitcher variant="standalone" />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="flex">
													<LanguageSwitcher variant="standalone" compact />
												</div>
											</TooltipTrigger>
											<TooltipContent side="right">
												{t("lang.label")}
											</TooltipContent>
										</Tooltip>
									),
							},
							{
								to: "/auth/logout",
								icon: "logout",
								label: t("nav.log_out"),
								show: true,
								destructive: true,
							},
						],
						showLabels,
						onNavigate,
					)}
				</div>
			)}
			{showLoginButton && (
				<div
					className={cn("pt-4 border-t border-border", !showLabels && "pt-2")}
				>
					{renderMenuLink(
						"/auth/login",
						"login",
						t("nav.login"),
						pathname === "/auth/login",
						showLabels,
						onNavigate,
					)}
				</div>
			)}
			{!showProfileMenu && !isInfoReel && showLabels && (
				<div>
					<ThemeSwitcher />
					<LanguageSwitcher variant="standalone" />
				</div>
			)}
			{!showProfileMenu && !isInfoReel && !showLabels && (
				<div className="space-y-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex">
								<ThemeSwitcher compact />
							</div>
						</TooltipTrigger>
						<TooltipContent side="right">{t("theme.label")}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex">
								<LanguageSwitcher variant="standalone" compact />
							</div>
						</TooltipTrigger>
						<TooltipContent side="right">{t("lang.label")}</TooltipContent>
					</Tooltip>
				</div>
			)}
		</>
	);

	// Shared menu content used by both mobile Sheet and desktop sidebar
	const renderMenuContent = (showLabels: boolean, onNavigate?: () => void) => (
		<>
			{renderMainNavItems(showLabels, onNavigate)}
			{renderBottomSection(showLabels, onNavigate)}
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
					<div className="shrink-0 flex items-center justify-between gap-2 px-2 py-2 border-b border-border">
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
					<nav className="flex flex-col gap-1 mt-2 overflow-y-auto min-h-0 flex-1 px-2">
						{renderMainNavItems(!sidebarCollapsed)}
					</nav>
					<div className="shrink-0 px-2 pb-4">
						{renderBottomSection(!sidebarCollapsed)}
					</div>
				</div>
			</aside>
		</TooltipProvider>
	);
}
