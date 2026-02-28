import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Button } from "~/components/ui/button";
import {
	Sheet,
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

const SUBNAVBAR_HEIGHT = "h-12";

function isChildActive(
	pathname: string,
	search: string,
	parentPath: string,
	childPath: string,
): boolean {
	if (parentPath === "/mail") {
		if (childPath === "/mail/received")
			return pathname === "/mail/received" || pathname === "/mail/inbox";
		if (childPath === "/mail/drafts") return pathname === "/mail/drafts";
		if (childPath === "/mail/sent") return pathname === "/mail/sent";
		if (childPath === "/mail/compose") return pathname.startsWith("/mail/compose");
		return false;
	}
	// Index/overview child (same path as parent): only active on exact match
	if (childPath === parentPath) {
		return pathname === childPath;
	}
	return pathname === childPath || pathname.startsWith(`${childPath}/`);
}

export function Subnavbar() {
	const location = useLocation();
	const pathname = location.pathname;
	const search = typeof location.search === "string" ? location.search : "";
	const { hasPermission } = useUser();
	const { isInfoReel, fillProgress, opacity } = useInfoReel();
	const { t } = useTranslation();
	const [sheetOpen, setSheetOpen] = useState(false);

	// Close sheet when route changes (e.g. after selecting a subroute from the sidebar)
	// biome-ignore lint/correctness/useExhaustiveDependencies: close sheet when route changes (pathname/search trigger only)
	useEffect(() => {
		setSheetOpen(false);
	}, [pathname, search]);

	const section = NAV_ITEMS.filter(
		(item) =>
			item.children?.length &&
			pathname.startsWith(item.path) &&
			(!item.permission || hasPermission(item.permission)),
	).sort((a, b) => b.path.length - a.path.length)[0];

	// Filter children by permissions
	const visibleChildren =
		section?.children?.filter(
			(child) => !child.permission || hasPermission(child.permission),
		) ?? [];

	if (!visibleChildren.length) {
		return <div className={cn("shrink-0", SUBNAVBAR_HEIGHT)} aria-hidden />;
	}

	const activeChild = visibleChildren.find((child) =>
		isChildActive(pathname, search, section.path, child.path),
	);
	const menuButtonLabel = activeChild
		? t(activeChild.i18nKey)
		: t(section.i18nKey);
	const menuButtonIcon = activeChild?.icon ?? section.icon;

	// Mobile/tablet: menu button that opens a sheet with the sub-items
	const mobileMenu = (
		<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
			<SheetTrigger asChild>
				<Button
					variant="ghost"
					className="flex items-center gap-2 px-3 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-primary/10 hover:text-primary transition-all h-9"
				>
					<span className="material-symbols-outlined text-xl shrink-0">
						{menuButtonIcon}
					</span>
					<span className="text-sm font-bold truncate max-w-[140px]">
						{menuButtonLabel}
					</span>
					<span className="material-symbols-outlined text-lg opacity-60 shrink-0">
						expand_more
					</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				side="left"
				className="w-72 h-full flex flex-col"
				showClose={true}
			>
				<SheetHeader className="shrink-0 flex flex-row items-center gap-2 space-y-0">
					<SheetTitle className="text-left text-lg font-black">
						{t(section.i18nKey)}
					</SheetTitle>
				</SheetHeader>
				<nav className="flex flex-col gap-0.5 mt-4 overflow-y-auto min-h-0 flex-1 pb-8">
					{visibleChildren.map((child) => {
						const active = isChildActive(
							pathname,
							search,
							section.path,
							child.path,
						);
						return (
							<Link
								key={child.path}
								to={child.path}
								onClick={() => setSheetOpen(false)}
								prefetch="intent"
								className={cn(
									"flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm w-full",
									"hover:bg-primary/10 hover:text-primary",
									active
										? "text-primary bg-primary/10 font-medium"
										: "text-gray-500 dark:text-gray-400",
								)}
							>
								<span className="material-symbols-outlined text-xl shrink-0">
									{child.icon}
								</span>
								<span className="font-medium">{t(child.i18nKey)}</span>
							</Link>
						);
					})}
				</nav>
			</SheetContent>
		</Sheet>
	);

	// Desktop (lg+): horizontal strip with icon + text (text from xl to avoid overflow at lg)
	const desktopStrip = (
		<div className="custom-scrollbar h-full min-w-0 max-w-full flex items-center justify-center gap-1 px-2 overflow-x-auto overflow-y-hidden">
			{visibleChildren.map((child) => {
				const active = isChildActive(
					pathname,
					search,
					section.path,
					child.path,
				);
				const isAnimating = isInfoReel && active;
				const link = (
					<Link
						key={child.path}
						to={child.path}
						prefetch="intent"
						className={cn(
							"relative overflow-hidden flex items-center gap-2 px-2 py-2 xl:px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0",
							"hover:bg-primary/10 hover:text-primary",
							!isAnimating &&
								(active ? "bg-primary/10 text-primary" : "text-muted-foreground"),
							isAnimating && "text-muted-foreground",
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
									opacity,
								}}
							/>
						)}
						<span className="material-symbols-outlined text-xl shrink-0">
							{child.icon}
						</span>
						<span className="hidden xl:inline">{t(child.i18nKey)}</span>
					</Link>
				);
				return (
					<Tooltip key={child.path}>
						<TooltipTrigger asChild>{link}</TooltipTrigger>
						<TooltipContent side="bottom">{t(child.i18nKey)}</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);

	return (
		<TooltipProvider delayDuration={200}>
			<nav
				className={cn(
					"shrink-0 min-w-0 flex border-b border-border/50 bg-background/50",
					SUBNAVBAR_HEIGHT,
				)}
				aria-label={t("nav.navigation")}
			>
				{/* Mobile/tablet: menu button + sheet */}
				<div className="lg:hidden h-full flex items-center px-2 shrink-0">
					{mobileMenu}
				</div>
				{/* Desktop: icon + text strip, centered */}
				<div className="hidden lg:flex lg:flex-1 lg:min-w-0 h-full justify-center">
					{desktopStrip}
				</div>
			</nav>
		</TooltipProvider>
	);
}
