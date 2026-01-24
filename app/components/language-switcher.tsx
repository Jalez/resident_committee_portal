import { useTranslation } from "react-i18next";
import { useFetcher, useRevalidator } from "react-router";
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
import { useLanguage } from "~/contexts/language-context";
import { useUser } from "~/contexts/user-context";
import { cn } from "~/lib/utils";

interface LanguageSwitcherProps {
	/** "standalone" renders as a full dropdown, "submenu" renders as a submenu item for profile dropdown */
	variant?: "standalone" | "submenu";
}

/**
 * Language Switcher Component
 *
 * Allows users to change both primary (UI) and secondary language.
 * Primary language changes immediately. Both are persisted to profile for logged-in users.
 */
export function LanguageSwitcher({
	variant = "standalone",
	className,
}: LanguageSwitcherProps & { className?: string }) {
	const { t, i18n } = useTranslation();
	const { supportedLanguages, languageNames, isInfoReel } = useLanguage();
	const { user } = useUser();
	const fetcher = useFetcher();
	const revalidator = useRevalidator();

	const currentLanguage = i18n.language;

	const changeLanguage = async (
		lang: string,
		type: "primary" | "secondary" = "primary",
	) => {
		if (type === "primary") {
			// Immediate client-side update for responsiveness
			i18n.changeLanguage(lang);
		}

		// Update both cookie and profile via API
		fetcher.submit(
			{ language: lang, type },
			{ method: "post", action: "/api/set-language" },
		);

		// For secondary language changes, we need to revalidate to refresh the user data
		// This ensures components using secondaryLanguage from context get the updated value
		if (type === "secondary") {
			// Small delay to let the API complete, then revalidate
			setTimeout(() => {
				revalidator.revalidate();
			}, 100);
		}
	};

	// Don't show when in info reel mode
	if (isInfoReel) {
		return null;
	}

	// Get user's secondary language from context
	const secondaryLanguage = user?.secondaryLanguage || "none";

	// Submenu variant - renders inside another dropdown (e.g., Profile menu)
	if (variant === "submenu") {
		return (
			<DropdownMenuSub>
				<DropdownMenuSubTrigger className="cursor-pointer">
					<span className="material-symbols-outlined text-lg mr-2">
						translate
					</span>
					{t("lang.label")}
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="w-56">
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						{t("settings.general.primary_language")}
					</DropdownMenuLabel>
					{supportedLanguages.map((lang) => (
						<DropdownMenuItem
							key={`primary-${lang}`}
							onClick={() => changeLanguage(lang, "primary")}
							className={cn(
								"cursor-pointer flex items-center justify-between",
								currentLanguage === lang && "bg-secondary",
							)}
						>
							<span>{languageNames[lang] || lang}</span>
							{currentLanguage === lang && (
								<span className="material-symbols-outlined text-sm">check</span>
							)}
						</DropdownMenuItem>
					))}

					<DropdownMenuSeparator />

					<DropdownMenuLabel className="text-xs text-muted-foreground">
						{t("settings.general.secondary_language")}
					</DropdownMenuLabel>
					{supportedLanguages.map((lang) => (
						<DropdownMenuItem
							key={`secondary-${lang}`}
							onClick={() => changeLanguage(lang, "secondary")}
							className={cn(
								"cursor-pointer flex items-center justify-between",
								secondaryLanguage === lang && "bg-secondary",
							)}
						>
							<span>{languageNames[lang] || lang}</span>
							{secondaryLanguage === lang && (
								<span className="material-symbols-outlined text-sm">check</span>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuItem
						onClick={() => changeLanguage("none", "secondary")}
						className={cn(
							"cursor-pointer flex items-center justify-between",
							secondaryLanguage === "none" && "bg-secondary",
						)}
					>
						<span>{t("settings.common.none")}</span>
						{secondaryLanguage === "none" && (
							<span className="material-symbols-outlined text-sm">check</span>
						)}
					</DropdownMenuItem>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		);
	}

	// Check if user is logged in (not guest)
	const isLoggedIn = user && user.userId !== "guest";

	// Standalone variant - mobile menu or desktop for guests (full dropdown)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className={cn(
						"flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-primary/10 hover:text-primary text-gray-500 dark:text-gray-400 text-left justify-start",
						className || "w-full",
					)}
				>
					<span className="material-symbols-outlined text-2xl">translate</span>
					<span className="text-sm font-bold">{t("lang.label")}</span>
					<span className="material-symbols-outlined text-lg opacity-60 ml-auto">
						expand_more
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{isLoggedIn && (
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						{t("settings.general.primary_language")}
					</DropdownMenuLabel>
				)}
				{supportedLanguages.map((lang) => (
					<DropdownMenuItem
						key={`primary-${lang}`}
						onClick={() => changeLanguage(lang, "primary")}
						className={cn(
							"cursor-pointer flex items-center justify-between",
							currentLanguage === lang && "bg-secondary",
						)}
					>
						<span>{languageNames[lang] || lang}</span>
						{currentLanguage === lang && (
							<span className="material-symbols-outlined text-sm">check</span>
						)}
					</DropdownMenuItem>
				))}

				{/* Secondary language only shown for logged-in users */}
				{isLoggedIn && (
					<>
						<DropdownMenuSeparator />

						<DropdownMenuLabel className="text-xs text-muted-foreground">
							{t("settings.general.secondary_language")}
						</DropdownMenuLabel>
						{supportedLanguages.map((lang) => (
							<DropdownMenuItem
								key={`secondary-${lang}`}
								onClick={() => changeLanguage(lang, "secondary")}
								className={cn(
									"cursor-pointer flex items-center justify-between",
									secondaryLanguage === lang && "bg-secondary",
								)}
							>
								<span>{languageNames[lang] || lang}</span>
								{secondaryLanguage === lang && (
									<span className="material-symbols-outlined text-sm">
										check
									</span>
								)}
							</DropdownMenuItem>
						))}
						<DropdownMenuItem
							onClick={() => changeLanguage("none", "secondary")}
							className={cn(
								"cursor-pointer flex items-center justify-between",
								secondaryLanguage === "none" && "bg-secondary",
							)}
						>
							<span>{t("settings.common.none")}</span>
							{secondaryLanguage === "none" && (
								<span className="material-symbols-outlined text-sm">check</span>
							)}
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
