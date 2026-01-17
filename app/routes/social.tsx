import { cn } from "~/lib/utils";
import type { Route } from "./+types/social";
import { PageWrapper, SplitLayout, QRPanel, ContentArea } from "~/components/layout/page-layout";
import { useLocalReel } from "~/contexts/info-reel-context";
import { SITE_CONFIG } from "~/lib/config.server";
import { getDatabase, type SocialLink, type NewSocialLink } from "~/db";
import { requirePermission, getAuthenticatedUser, getGuestPermissions } from "~/lib/auth.server";
import { Form, Link } from "react-router";
import { useState } from "react";
import { useUser } from "~/contexts/user-context";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Some / Social` },
        { name: "description", content: "Seuraa meitä somessa / Follow us on social media" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    // Check permission (works for both logged-in users and guests)
    const authUser = await getAuthenticatedUser(request, getDatabase);
    const permissions = authUser
        ? authUser.permissions
        : await getGuestPermissions(() => getDatabase());

    const canRead = permissions.some(p => p === "social:read" || p === "*");
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

    const db = getDatabase();
    const links = await db.getSocialLinks();

    // Sort by sortOrder
    const sortedLinks = links.sort((a, b) => a.sortOrder - b.sortOrder);
    const activeLinks = sortedLinks.filter(link => link.isActive);

    return {
        siteConfig: SITE_CONFIG,
        channels: activeLinks,
        allLinks: sortedLinks,
    };
}

export async function action({ request }: Route.ActionArgs) {
    // Require permission for any action
    await requirePermission(request, "social:write", getDatabase);

    const db = getDatabase();
    const formData = await request.formData();
    const actionType = formData.get("_action") as string;

    if (actionType === "update") {
        const id = formData.get("id") as string;
        await db.updateSocialLink(id, {
            name: formData.get("name") as string,
            icon: formData.get("icon") as string,
            url: formData.get("url") as string,
            color: formData.get("color") as string,
            sortOrder: parseInt(formData.get("sortOrder") as string) || 0,
            isActive: formData.get("isActive") === "on",
        });
    } else if (actionType === "delete") {
        const id = formData.get("id") as string;
        await db.deleteSocialLink(id);
    }

    return { success: true };
}

export default function Social({ loaderData }: Route.ComponentProps) {
    const { channels, allLinks } = loaderData;
    const { hasPermission } = useUser();
    const canWrite = hasPermission("social:write");

    const [editingId, setEditingId] = useState<string | null>(null);

    // Use local reel for cycling through channels in info reel mode
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

    // Use allLinks for staff view (shows inactive too), channels for regular view
    const displayLinks = canWrite && !isInfoReel ? allLinks : channels;

    // Footer with add link for staff
    const FooterContent = canWrite && !isInfoReel ? (
        <div className="flex items-center gap-2">
            <Link
                to="/social/new"
                className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                title="Lisää / Add"
            >
                <span className="material-symbols-outlined text-xl">add</span>
            </Link>
        </div>
    ) : undefined;

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                header={{ finnish: "Sosiaalinen Media", english: "Social Media" }}
                footer={FooterContent}
            >
                <ContentArea className="space-y-2">
                    {displayLinks.map((channel, index) => {
                        const isActive = isInfoReel && index === activeIndex;
                        const isEditing = editingId === channel.id;

                        // Edit form
                        if (isEditing && canWrite) {
                            return (
                                <div key={channel.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                                    <Form method="post" className="space-y-3" onSubmit={() => setEditingId(null)}>
                                        <input type="hidden" name="_action" value="update" />
                                        <input type="hidden" name="id" value={channel.id} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label className="text-xs">Nimi</Label>
                                                <Input name="name" required defaultValue={channel.name} className="h-8" />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Ikoni</Label>
                                                <Input name="icon" required defaultValue={channel.icon} className="h-8" />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs">URL</Label>
                                            <Input name="url" type="url" required defaultValue={channel.url} className="h-8" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label className="text-xs">Väri</Label>
                                                <Input name="color" defaultValue={channel.color} className="h-8" />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Järjestys</Label>
                                                <Input name="sortOrder" type="number" defaultValue={channel.sortOrder} className="h-8" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox id={`edit-isActive-${channel.id}`} name="isActive" defaultChecked={channel.isActive} />
                                            <Label htmlFor={`edit-isActive-${channel.id}`} className="text-xs">Aktiivinen</Label>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
                                                Peruuta
                                            </Button>
                                            <Button type="submit" size="sm">Tallenna</Button>
                                        </div>
                                    </Form>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={channel.id}
                                className={cn(
                                    "relative w-full flex items-center gap-6 p-5 rounded-xl transition-all text-left group outline-none overflow-hidden",
                                    !isActive && "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50",
                                    !channel.isActive && "opacity-50"
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

                                <a
                                    href={channel.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-6 flex-1"
                                >
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
                                        {!channel.isActive && canWrite && (
                                            <span className="text-xs text-gray-400">(piilotettu)</span>
                                        )}
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

                                {/* Staff actions */}
                                {canWrite && !isInfoReel && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(channel.id)}
                                            className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            <span className="material-symbols-outlined text-xl">edit</span>
                                        </button>
                                        <Form method="post" className="inline" onSubmit={(e) => {
                                            if (!confirm("Poista? / Delete?")) e.preventDefault();
                                        }}>
                                            <input type="hidden" name="_action" value="delete" />
                                            <input type="hidden" name="id" value={channel.id} />
                                            <button
                                                type="submit"
                                                className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                            >
                                                <span className="material-symbols-outlined text-xl">delete</span>
                                            </button>
                                        </Form>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {displayLinks.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <span className="material-symbols-outlined text-5xl mb-4 block opacity-50">share</span>
                            <p className="font-medium">Ei sosiaalisia kanavia / No social channels</p>
                            {canWrite && (
                                <Link to="/social/new">
                                    <Button className="mt-4">
                                        <span className="material-symbols-outlined mr-2">add</span>
                                        Lisää ensimmäinen / Add first
                                    </Button>
                                </Link>
                            )}
                        </div>
                    )}
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
