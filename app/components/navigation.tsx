import { Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";
import { useInfoReel } from "~/contexts/info-reel-context";

export function Navigation({ className, orientation = "vertical" }: { className?: string; orientation?: "vertical" | "horizontal" }) {
    const location = useLocation();
    const pathname = location.pathname;
    const { isInfoReel, fillProgress, opacity } = useInfoReel();

    const allNavItems = [
        { path: "/", icon: "volunteer_activism", label: "Osallistu", subLabel: "Get Involved" },
        { path: "/events", icon: "event", label: "Tapahtumat", subLabel: "Events" },
        { path: "/budget", icon: "payments", label: "Budjetti", subLabel: "Budget" },
        { path: "/minutes", icon: "description", label: "Pöytäkirjat", subLabel: "Minutes" },
        { path: "/social", icon: "forum", label: "Some", subLabel: "Social" },
        { path: "/auth/login", icon: "login", label: "Kirjaudu", subLabel: "Login", isAdmin: true },
    ];

    // Hide login item in info reel mode
    const navItems = isInfoReel
        ? allNavItems.filter(item => !item.isAdmin)
        : allNavItems;

    return (
        <nav className={cn(
            "flex items-center justify-center gap-1",
            orientation === "vertical" ? "flex-col h-full" : "flex-row w-full",
            className
        )}>
            {navItems.map((item) => {
                const isActive = pathname === item.path;
                const isAnimating = isActive && isInfoReel;

                return (
                    <Link
                        key={item.path}
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
                            <span className="text-sm md:text-base font-bold">{item.label}</span>
                            <span className="text-[10px] md:text-xs opacity-60 font-medium">{item.subLabel}</span>
                        </div>

                        {/* Tooltip - Show when labels are hidden (small screens or vertical) */}
                        <div className={cn(
                            "absolute bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg px-3 py-2",
                            "opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap shadow-xl z-[60]",
                            // Vertical Sidebar Tooltip (Right)
                            orientation === "vertical"
                                ? "left-full ml-4 translate-x-[-10px] group-hover:translate-x-0 top-1/2 -translate-y-1/2"
                                : "top-full mt-2 left-1/2 -translate-x-1/2 translate-y-[-10px] group-hover:translate-y-0 lg:hidden", // Horizontal Bottom Tooltip (Small screens only)
                        )}>
                            <span className="block text-sm font-bold leading-none">
                                {item.label}
                            </span>
                            {/* Arrow */}
                            <div className={cn(
                                "absolute border-[5px] border-transparent",
                                orientation === "vertical"
                                    ? "right-[100%] top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-white"
                                    : "bottom-[100%] left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-white"
                            )} />
                        </div>
                    </Link>
                );
            })}
        </nav>
    );
}

