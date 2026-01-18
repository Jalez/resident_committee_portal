import { useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useLanguage } from "~/contexts/language-context";

interface MobileActionMenuProps {
    children: React.ReactNode;
    /** Label for the mobile menu button (Finnish / English) */
    label?: {
        finnish: string;
        english: string;
    };
    /** Icon for the mobile menu button */
    icon?: string;
    className?: string;
}

interface ActionItem {
    href: string;
    icon: string;
    labelFi: string;
    labelEn: string;
    external?: boolean;
}

interface MobileActionMenuWithItemsProps {
    items: ActionItem[];
    /** Label for the mobile menu button */
    label?: {
        finnish: string;
        english: string;
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
 *     { href: "/treasury/breakdown", icon: "table_chart", labelFi: "Erittely", labelEn: "Breakdown" },
 *     { href: "/treasury/new", icon: "add", labelFi: "Lisää", labelEn: "Add" },
 *   ]}
 * />
 * ```
 */
export function MobileActionMenuWithItems({
    items,
    label = { finnish: "Toiminnot", english: "Actions" },
    icon = "more_vert",
    className,
}: MobileActionMenuWithItemsProps) {
    const { language, isInfoReel } = useLanguage();

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
                            <span className="material-symbols-outlined text-lg">
                                {icon}
                            </span>
                            <span className="text-xs font-bold">
                                {(language === "fi" || isInfoReel) ? label.finnish : label.english}
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
                                                {(language === "fi" || isInfoReel) ? item.labelFi : item.labelEn}
                                            </p>
                                            {isInfoReel && (
                                                <p className="text-xs text-muted-foreground">
                                                    {item.labelEn}
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
                                                {(language === "fi" || isInfoReel) ? item.labelFi : item.labelEn}
                                            </p>
                                            {isInfoReel && (
                                                <p className="text-xs text-muted-foreground">
                                                    {item.labelEn}
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
                                    {(language === "fi" || isInfoReel) ? item.labelFi : item.labelEn}
                                </span>
                                {isInfoReel && (
                                    <span className="text-xs font-bold opacity-80">
                                        {item.labelEn}
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
                                    {(language === "fi" || isInfoReel) ? item.labelFi : item.labelEn}
                                </span>
                                {isInfoReel && (
                                    <span className="text-xs font-bold opacity-80">
                                        {item.labelEn}
                                    </span>
                                )}
                            </div>
                        </a>
                    )
                )}
            </div>
        </>
    );
}
