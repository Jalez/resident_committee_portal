import { useInfoReel } from "~/contexts/info-reel-context";
import { cn } from "~/lib/utils";
import React from "react";

interface ReelAnimatedProps {
    children: React.ReactNode;
    index?: number;
    className?: string;
}

/**
 * Wrapper that applies staggered entrance animation in info reel mode.
 * Each child appears with a delay based on its index.
 */
export function ReelAnimated({ children, index = 0, className }: ReelAnimatedProps) {
    const { isInfoReel } = useInfoReel();

    const delayMs = index * 150; // 150ms stagger between items

    return (
        <div
            className={cn(
                "transition-all duration-700 ease-out",
                isInfoReel && "animate-reel-fade-in",
                className
            )}
            style={isInfoReel ? {
                animationDelay: `${delayMs}ms`,
                animationFillMode: "backwards"
            } : undefined}
        >
            {children}
        </div>
    );
}

/**
 * Wraps each direct child with staggered animation in reel mode.
 */
export function ReelAnimatedList({ children, className }: { children: React.ReactNode; className?: string }) {
    const { isInfoReel } = useInfoReel();

    const childArray = React.Children.toArray(children);

    return (
        <div className={className}>
            {childArray.map((child, index) => (
                <ReelAnimated key={index} index={index}>
                    {child}
                </ReelAnimated>
            ))}
        </div>
    );
}
