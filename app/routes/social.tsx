import { cn } from "~/lib/utils";
import type { Route } from "./+types/social";
import { PageWrapper, SplitLayout, QRPanel, ContentArea } from "~/components/layout/page-layout";
import { getSocialChannels, type SocialChannel } from "~/lib/google.server";
import { useLocalReel } from "~/contexts/info-reel-context";
import { queryClient } from "~/lib/query-client";
import { queryKeys, STALE_TIME } from "~/lib/query-config";
import { SITE_CONFIG } from "~/lib/config.server";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Some / Social` },
        { name: "description", content: "Seuraa meitä somessa / Follow us on social media" },
    ];
}

export async function loader({ }: Route.LoaderArgs) {
    const channels = await queryClient.ensureQueryData({
        queryKey: queryKeys.social,
        queryFn: getSocialChannels,
        staleTime: STALE_TIME,
    });
    return { siteConfig: SITE_CONFIG, channels };
}

export default function Social({ loaderData }: Route.ComponentProps) {
    const { channels } = loaderData;

    // Use local reel for cycling through channels in info reel mode
    // Duration per channel is auto-calculated from route duration / channel count
    const { activeIndex, activeItem: activeChannel, isInfoReel, itemFillProgress, itemOpacity } = useLocalReel({
        items: channels,
    });

    // Fallback to first channel if no active item
    const displayChannel = activeChannel || channels[0];


    // QR Panel only shown in info reel mode, cycling through channels
    const RightContent = displayChannel ? (
        <QRPanel
            qrUrl={displayChannel.url}
            key={displayChannel.id}
            opacity={itemOpacity}
            title={
                <h2
                    className="text-3xl font-black tracking-tight uppercase"
                    style={{
                        color: `color-mix(in srgb, var(--foreground) ${itemOpacity * 100}%, transparent ${(1 - itemOpacity) * 100}%)`
                    }}
                >
                    {displayChannel.name}
                </h2>
            }
        />
    ) : null;

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                header={{ finnish: "Sosiaalinen Media", english: "Social Media" }}
            >
                <ContentArea className="space-y-2">
                    {channels.map((channel, index) => {
                        const isActive = isInfoReel && index === activeIndex;

                        return (
                            <a
                                key={channel.id}
                                href={channel.url}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                    "relative w-full flex items-center gap-6 p-5 rounded-xl transition-all text-left group outline-none overflow-hidden",
                                    !isActive && "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                )}
                            >
                                {/* Animated filling background for active channel */}
                                {isActive && (
                                    <div
                                        className="absolute inset-0 bg-primary/10 pointer-events-none"
                                        style={{
                                            clipPath: `inset(0 ${100 - itemFillProgress}% 0 0)`,
                                            opacity: itemOpacity
                                        }}
                                    />
                                )}

                                <span
                                    className={cn(
                                        "relative material-symbols-outlined text-3xl transition-transform group-hover:scale-110",
                                        !isActive && "text-gray-400 dark:text-gray-500"
                                    )}
                                    style={isActive ? {
                                        color: `color-mix(in srgb, var(--primary) ${itemOpacity * 100}%, var(--muted-foreground) ${(1 - itemOpacity) * 100}%)`
                                    } : undefined}
                                >
                                    {channel.icon}
                                </span>
                                <div className="relative flex-1">
                                    <h3
                                        className={cn(
                                            "text-2xl font-black leading-tight uppercase tracking-wide",
                                            !isActive && "text-gray-900 dark:text-white group-hover:text-primary"
                                        )}
                                        style={isActive ? {
                                            color: `color-mix(in srgb, var(--primary) ${itemOpacity * 100}%, var(--foreground) ${(1 - itemOpacity) * 100}%)`
                                        } : undefined}
                                    >
                                        {channel.name}
                                    </h3>
                                </div>
                                <span
                                    className={cn(
                                        "relative material-symbols-outlined ml-auto text-2xl",
                                        !isActive && "text-gray-300 dark:text-gray-600 group-hover:text-primary group-hover:translate-x-1"
                                    )}
                                    style={isActive ? {
                                        color: `color-mix(in srgb, var(--primary) ${itemOpacity * 100}%, var(--muted-foreground) ${(1 - itemOpacity) * 100}%)`
                                    } : undefined}
                                >
                                    open_in_new
                                </span>
                            </a>
                        );
                    })}
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}

