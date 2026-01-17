import type { Route } from "./+types/social.new";
import { Form, redirect, useNavigate } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type NewSocialLink } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Uusi some-kanava / New Social Channel` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "social:write", getDatabase);
    return { siteConfig: SITE_CONFIG };
}

export async function action({ request }: Route.ActionArgs) {
    await requirePermission(request, "social:write", getDatabase);
    const db = getDatabase();

    const formData = await request.formData();

    const newLink: NewSocialLink = {
        name: formData.get("name") as string,
        icon: formData.get("icon") as string,
        url: formData.get("url") as string,
        color: (formData.get("color") as string) || "bg-blue-500",
        sortOrder: parseInt(formData.get("sortOrder") as string) || 0,
        isActive: formData.get("isActive") === "on",
    };

    await db.createSocialLink(newLink);

    return redirect("/social");
}

// Common Material icons for social media
const COMMON_ICONS = [
    { icon: "send", label: "Telegram" },
    { icon: "photo_camera", label: "Instagram" },
    { icon: "thumb_up", label: "Facebook" },
    { icon: "public", label: "Website" },
    { icon: "mail", label: "Email" },
    { icon: "chat", label: "Discord" },
    { icon: "videocam", label: "YouTube" },
    { icon: "link", label: "Link" },
];

// Common color presets
const COLOR_PRESETS = [
    { value: "bg-blue-500", label: "Sininen / Blue" },
    { value: "bg-blue-700", label: "Tummansininen / Dark Blue" },
    { value: "bg-pink-600", label: "Pinkki / Pink" },
    { value: "bg-purple-600", label: "Violetti / Purple" },
    { value: "bg-red-600", label: "Punainen / Red" },
    { value: "bg-green-600", label: "Vihreä / Green" },
    { value: "bg-orange-500", label: "Oranssi / Orange" },
    { value: "bg-gray-700", label: "Harmaa / Gray" },
];

export default function SocialNew({ loaderData }: Route.ComponentProps) {
    const navigate = useNavigate();

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate("/social")}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                            Uusi some-kanava
                        </h1>
                        <p className="text-lg text-gray-500">New Social Channel</p>
                    </div>
                </div>

                {/* Form */}
                <Form method="post" className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name">Nimi / Name *</Label>
                            <Input
                                id="name"
                                name="name"
                                required
                                placeholder="Telegram"
                            />
                        </div>

                        {/* URL */}
                        <div className="space-y-2">
                            <Label htmlFor="url">URL *</Label>
                            <Input
                                id="url"
                                name="url"
                                type="url"
                                required
                                placeholder="https://t.me/yourgroup"
                            />
                        </div>

                        {/* Icon */}
                        <div className="space-y-2">
                            <Label htmlFor="icon">Ikoni / Icon *</Label>
                            <Input
                                id="icon"
                                name="icon"
                                required
                                placeholder="send"
                            />
                            <div className="flex flex-wrap gap-2 mt-2">
                                {COMMON_ICONS.map(({ icon, label }) => (
                                    <button
                                        key={icon}
                                        type="button"
                                        onClick={() => {
                                            const input = document.getElementById("icon") as HTMLInputElement;
                                            if (input) input.value = icon;
                                        }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                                        title={label}
                                    >
                                        <span className="material-symbols-outlined text-lg">{icon}</span>
                                        <span className="text-xs text-gray-500">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Color */}
                        <div className="space-y-2">
                            <Label htmlFor="color">Väri / Color</Label>
                            <select
                                id="color"
                                name="color"
                                defaultValue="bg-blue-500"
                                className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                                {COLOR_PRESETS.map(({ value, label }) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sort Order */}
                        <div className="space-y-2">
                            <Label htmlFor="sortOrder">Järjestys / Sort Order</Label>
                            <Input
                                id="sortOrder"
                                name="sortOrder"
                                type="number"
                                defaultValue="0"
                                placeholder="0"
                            />
                            <p className="text-xs text-gray-500">
                                Pienemmät numerot näkyvät ensin / Lower numbers appear first
                            </p>
                        </div>

                        {/* Active */}
                        <div className="flex items-center gap-3">
                            <Checkbox id="isActive" name="isActive" defaultChecked />
                            <Label htmlFor="isActive">
                                Aktiivinen / Active
                                <span className="text-xs text-gray-500 block">
                                    Piilotetut kanavat näkyvät vain henkilökunnalle / Hidden channels only visible to staff
                                </span>
                            </Label>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4">
                        <Button type="button" variant="outline" onClick={() => navigate("/social")}>
                            Peruuta / Cancel
                        </Button>
                        <Button type="submit">
                            <span className="material-symbols-outlined mr-2">add</span>
                            Lisää / Add
                        </Button>
                    </div>
                </Form>
            </div>
        </PageWrapper>
    );
}
