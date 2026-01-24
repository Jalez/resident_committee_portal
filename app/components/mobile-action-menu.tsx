import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useLanguage } from "~/contexts/language-context";
import { cn } from "~/lib/utils";

interface ActionItem {
	href: string;
	icon: string;
	labelPrimary: string;
	labelSecondary: string;
	external?: boolean;
}

interface MobileActionMenuWithItemsProps {
	items: ActionItem[];
	/** Label for the mobile menu button */
	label?: {
		primary: string;
		secondary: string;
	};
	/** Icon for the mobile menu button */
	icon?: string;
	className?: string;
}

/**
 * A component that renders action buttons inline on desktop,
 * but collapses them into a dropdown menu on mobile to save screen space.
 *
 * Usage with items prop (recommended):
 * ```tsx
 * <MobileActionMenuWithItems
 *   items={[
 *     { href: "/treasury/breakdown", icon: "table_chart", labelPrimary: "Erittely", labelSecondary: "Breakdown" },
 *     { href: "/treasury/new", icon: "add", labelPrimary: "Lisää", labelSecondary: "Add" },
 *   ]}
 * />
 * ```
 */
export function MobileActionMenuWithItems({
	items,
	label = { primary: "Toiminnot", secondary: "Actions" },
	icon = "more_vert",
	className,
}: MobileActionMenuWithItemsProps) {
	const { language, isInfoReel, secondaryLanguage } = useLanguage();

	const getLabel = (primary: string, secondary: string) => {
		if (isInfoReel) {
			return primary;
		}
		return language === secondaryLanguage ? secondary : primary;
	};

	return (
		<>
			{/* Mobile: Dropdown menu */}
			<div className={cn("md:hidden", className)}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="default"
							size="sm"
							className="group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-300"
						>
							<span className="material-symbols-outlined text-lg">{icon}</span>
							<span className="text-xs font-bold">
								{getLabel(label.primary, label.secondary)}
							</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						{items.map((item) => (
							<DropdownMenuItem key={item.href} asChild>
								{item.external ? (
									<a
										href={item.href}
										target="_blank"
										rel="noreferrer"
										className="flex items-center gap-2 cursor-pointer"
									>
										<span className="material-symbols-outlined text-lg">
											{item.icon}
										</span>
										<div>
											<p className="font-medium">
												{getLabel(item.labelPrimary, item.labelSecondary)}
											</p>
											{isInfoReel && (
												<p className="text-xs text-muted-foreground">
													{item.labelSecondary}
												</p>
											)}
										</div>
									</a>
								) : (
									<a
										href={item.href}
										className="flex items-center gap-2 cursor-pointer"
									>
										<span className="material-symbols-outlined text-lg">
											{item.icon}
										</span>
										<div>
											<p className="font-medium">
												{getLabel(item.labelPrimary, item.labelSecondary)}
											</p>
											{isInfoReel && (
												<p className="text-xs text-muted-foreground">
													{item.labelSecondary}
												</p>
											)}
										</div>
									</a>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Desktop: Render inline buttons */}
			<div className={cn("hidden md:flex items-center gap-2", className)}>
				{items.map((item) =>
					item.external ? (
						<a
							key={item.href}
							href={item.href}
							target="_blank"
							rel="noreferrer"
							className="group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-300"
						>
							<span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
								{item.icon}
							</span>
							<div className="flex flex-col items-start">
								<span className="text-sm font-black tracking-tight leading-tight">
									{getLabel(item.labelPrimary, item.labelSecondary)}
								</span>
								{isInfoReel && (
									<span className="text-xs font-bold opacity-80">
										{item.labelSecondary}
									</span>
								)}
							</div>
						</a>
					) : (
						<a
							key={item.href}
							href={item.href}
							className="group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-300"
						>
							<span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
								{item.icon}
							</span>
							<div className="flex flex-col items-start">
								<span className="text-sm font-black tracking-tight leading-tight">
									{getLabel(item.labelPrimary, item.labelSecondary)}
								</span>
								{isInfoReel && (
									<span className="text-xs font-bold opacity-80">
										{item.labelSecondary}
									</span>
								)}
							</div>
						</a>
					),
				)}
			</div>
		</>
	);
}
