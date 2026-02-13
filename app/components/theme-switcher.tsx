import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

interface ThemeSwitcherProps {
	compact?: boolean;
	className?: string;
}

export function ThemeSwitcher({
	compact = false,
	className,
}: ThemeSwitcherProps) {
	const { t } = useTranslation();
	const { theme, setTheme } = useTheme();

	const themeOptions = [
		{ value: "system", label: t("theme.system"), icon: "settings_suggest" },
		{ value: "light", label: t("theme.light"), icon: "light_mode" },
		{ value: "dark", label: t("theme.dark"), icon: "dark_mode" },
	];

	const currentTheme =
		themeOptions.find((opt) => opt.value === theme) || themeOptions[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className={cn(
						"flex items-center gap-3 rounded-xl transition-all hover:bg-primary/10 hover:text-primary text-gray-500 dark:text-gray-400",
						compact
							? "justify-center px-3 py-2 w-full"
							: "text-left justify-start px-2 py-2 w-full",
						className,
					)}
				>
					<span className="material-symbols-outlined text-2xl shrink-0">
						{currentTheme.icon}
					</span>
					{!compact && (
						<>
							<span className="text-sm font-bold flex-1">
								{t("theme.label")}
							</span>
							<span className="material-symbols-outlined text-lg opacity-60">
								expand_more
							</span>
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				{themeOptions.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onClick={() => setTheme(option.value)}
						className={cn(
							"cursor-pointer flex items-center justify-between",
							theme === option.value && "bg-primary/10 text-primary",
						)}
					>
						<span className="flex items-center gap-2">
							<span className="material-symbols-outlined text-lg">
								{option.icon}
							</span>
							{option.label}
						</span>
						{theme === option.value && (
							<span className="material-symbols-outlined text-sm">check</span>
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
