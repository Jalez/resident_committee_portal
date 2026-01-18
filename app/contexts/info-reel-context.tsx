import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { getInfoReelNavItems, type NavItem } from "~/lib/nav-config";
import { useUser } from "./user-context";

// Route configuration with optional per-route durations
interface RouteConfig {
    path: string;
    duration?: number; // Optional override for this route
}

const DEFAULT_REEL_DURATION = 8000; // 8 seconds default

// Timing phases (as percentage of total duration)
const FILL_PHASE = 0.70;   // 70% - progress bar fills
const HOLD_PHASE = 0.20;   // 20% - stays at 100%
const FADE_PHASE = 0.10;   // 10% - fades out (and next fades in)

// Helper to check if a permission matches (supports wildcards)
function permissionMatches(userPermission: string, requiredPermission: string): boolean {
    if (userPermission === requiredPermission) return true;
    if (userPermission.endsWith(":*")) {
        const prefix = userPermission.slice(0, -1);
        return requiredPermission.startsWith(prefix);
    }
    if (userPermission === "*") return true;
    return false;
}

function hasPermission(permissions: string[], permission: string): boolean {
    return permissions.some(p => permissionMatches(p, permission));
}

interface InfoReelContextValue {
    isInfoReel: boolean;
    progress: number; // 0-100, where 100 = just started, 0 = about to transition (legacy)
    fillProgress: number; // 0-100, the fill animation progress
    opacity: number; // 0-1, for fade in/out
    currentRouteDuration: number; // Duration for current route in ms
}

const InfoReelContext = createContext<InfoReelContextValue>({
    isInfoReel: false,
    progress: 100,
    fillProgress: 0,
    opacity: 1,
    currentRouteDuration: DEFAULT_REEL_DURATION,
});

export function useInfoReel() {
    return useContext(InfoReelContext);
}

/**
 * Hook for page-specific cycling in info reel mode.
 * Automatically calculates duration per item to fill the route's total duration.
 */
interface UseLocalReelOptions<T> {
    items: T[];
}

interface UseLocalReelResult<T> {
    activeIndex: number;
    activeItem: T | undefined;
    isInfoReel: boolean;
    itemDuration: number; // Duration per item in ms
    itemFillProgress: number; // 0-100, fill animation progress for current item
    itemOpacity: number; // 0-1, opacity for fade transitions
}

export function useLocalReel<T>({ items }: UseLocalReelOptions<T>): UseLocalReelResult<T> {
    const { isInfoReel, currentRouteDuration } = useInfoReel();
    const [activeIndex, setActiveIndex] = useState(0);
    const [itemFillProgress, setItemFillProgress] = useState(0);
    const [itemOpacity, setItemOpacity] = useState(1);

    // Calculate duration per item to evenly split the route duration
    const itemDuration = items.length > 0 ? currentRouteDuration / items.length : currentRouteDuration;

    useEffect(() => {
        // Reset to first item when items change or route changes
        setActiveIndex(0);
        setItemFillProgress(0);
        setItemOpacity(1);
    }, [items.length, currentRouteDuration]);

    useEffect(() => {
        if (!isInfoReel || items.length <= 1) return;

        const startTime = Date.now();
        let prevIndex = 0;

        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;

            // Calculate which item we should be on
            const newIndex = Math.floor(elapsed / itemDuration) % items.length;

            // Calculate progress within current item
            const currentItemElapsed = elapsed % itemDuration;
            const itemPhase = currentItemElapsed / itemDuration;

            // Calculate fill progress based on phase
            let fill: number;
            let opacity: number;

            if (itemPhase < FILL_PHASE) {
                // Fill phase: 0 to 100%
                fill = (itemPhase / FILL_PHASE) * 100;
                opacity = 1;
            } else if (itemPhase < FILL_PHASE + HOLD_PHASE) {
                // Hold phase: stay at 100%
                fill = 100;
                opacity = 1;
            } else {
                // Fade phase: stay at 100%, reduce opacity
                fill = 100;
                const fadeProgress = (itemPhase - FILL_PHASE - HOLD_PHASE) / FADE_PHASE;
                opacity = 1 - fadeProgress;
            }

            setItemFillProgress(fill);
            setItemOpacity(opacity);

            // Update index if changed
            if (newIndex !== prevIndex) {
                prevIndex = newIndex;
                setActiveIndex(newIndex);
            }
        }, 50); // Update every 50ms for smooth animation

        return () => clearInterval(progressInterval);
    }, [isInfoReel, items.length, itemDuration]);

    return {
        activeIndex,
        activeItem: items[activeIndex],
        isInfoReel,
        itemDuration,
        itemFillProgress,
        itemOpacity,
    };
}

export function InfoReelProvider({ children }: { children: ReactNode }) {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useUser();

    const isInfoReel = searchParams.get("view") === "infoReel";
    const [progress, setProgress] = useState(100);
    const [fillProgress, setFillProgress] = useState(0);
    const [opacity, setOpacity] = useState(1);

    // Track if we're currently navigating to prevent double-navigation
    const isNavigatingRef = useRef(false);
    // Track the current path to detect actual route changes
    const currentPathRef = useRef(location.pathname);

    // Compute accessible routes based on user permissions
    const reelRoutes: RouteConfig[] = useMemo(() => {
        const navItems = getInfoReelNavItems();
        const userPermissions = user?.permissions ?? [];

        return navItems
            .filter(item => {
                // Items without permission requirement are always accessible
                if (!item.permission) return true;
                // Check if user has the required permission
                return hasPermission(userPermissions, item.permission);
            })
            .map(item => ({
                path: item.path,
                duration: item.infoReelDuration,
            }));
    }, [user?.permissions]);

    // Get current route config
    const getCurrentRouteConfig = useCallback((): RouteConfig | undefined => {
        return reelRoutes.find((r: RouteConfig) => r.path === location.pathname);
    }, [location.pathname, reelRoutes]);

    const getCurrentRouteIndex = useCallback(() => {
        return reelRoutes.findIndex((r: RouteConfig) => r.path === location.pathname);
    }, [location.pathname, reelRoutes]);

    // Get duration for current route
    const currentRouteDuration = getCurrentRouteConfig()?.duration ?? DEFAULT_REEL_DURATION;

    const navigateToNextRoute = useCallback(() => {
        // Prevent double-navigation
        if (isNavigatingRef.current) return;
        if (reelRoutes.length === 0) return;
        isNavigatingRef.current = true;

        const currentIndex = getCurrentRouteIndex();
        const nextIndex = (currentIndex + 1) % reelRoutes.length;
        // Use replace to avoid building up browser history
        navigate(`${reelRoutes[nextIndex].path}?view=infoReel`, { replace: true });
    }, [getCurrentRouteIndex, navigate, reelRoutes]);

    // Reset navigation flag when route actually changes
    useEffect(() => {
        if (currentPathRef.current !== location.pathname) {
            currentPathRef.current = location.pathname;
            isNavigatingRef.current = false;
        }
    }, [location.pathname]);

    useEffect(() => {
        if (!isInfoReel) {
            setProgress(100);
            setFillProgress(0);
            setOpacity(1);
            return;
        }

        // Reset on route change
        setProgress(100);
        setFillProgress(0);
        setOpacity(1);

        const startTime = Date.now();
        const intervalId = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const phase = elapsed / currentRouteDuration;

            // Legacy progress (100 to 0)
            const remaining = Math.max(0, 100 - (elapsed / currentRouteDuration) * 100);
            setProgress(remaining);

            // New phased progress
            let fill: number;
            let op: number;

            if (phase < FILL_PHASE) {
                // Fill phase: 0 to 100%
                fill = (phase / FILL_PHASE) * 100;
                op = 1;
            } else if (phase < FILL_PHASE + HOLD_PHASE) {
                // Hold phase: stay at 100%
                fill = 100;
                op = 1;
            } else if (phase < 1) {
                // Fade phase: stay at 100%, reduce opacity
                fill = 100;
                const fadeProgress = (phase - FILL_PHASE - HOLD_PHASE) / FADE_PHASE;
                op = 1 - fadeProgress;
            } else {
                fill = 100;
                op = 0;
            }

            setFillProgress(fill);
            setOpacity(op);

            if (remaining <= 0) {
                navigateToNextRoute();
            }
        }, 50); // Update every 50ms for smooth animation

        return () => clearInterval(intervalId);
    }, [isInfoReel, location.pathname, navigateToNextRoute, currentRouteDuration]);

    return (
        <InfoReelContext.Provider value={{ isInfoReel, progress, fillProgress, opacity, currentRouteDuration }}>
            {children}
        </InfoReelContext.Provider>
    );
}



