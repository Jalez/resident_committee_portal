import type { Route } from "./+types/inventory.$itemId.edit";
import { Form, redirect, useNavigate } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type InventoryItem, type NewInventoryItem } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";

export function meta({ data }: Route.MetaArgs) {
    const itemName = data?.item?.name;
    const title = itemName
        ? `Muokkaa: ${itemName} / Edit: ${itemName}`
        : "Muokkaa tavaraa / Edit Item";
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    await requirePermission(request, "inventory:write", getDatabase);
    const db = getDatabase();

    const item = await db.getInventoryItemById(params.itemId);
    if (!item) {
        throw new Response("Not Found", { status: 404 });
    }

    return {
        siteConfig: SITE_CONFIG,
        item,
    };
}

export async function action({ request, params }: Route.ActionArgs) {
    await requirePermission(request, "inventory:write", getDatabase);
    const db = getDatabase();

    const formData = await request.formData();

    const updateData: Partial<Omit<NewInventoryItem, "id">> = {
        name: formData.get("name") as string,
        quantity: parseInt(formData.get("quantity") as string) || 1,
        location: formData.get("location") as string,
        category: (formData.get("category") as string) || null,
        description: (formData.get("description") as string) || null,
        value: formData.get("value") as string || "0",
        showInInfoReel: formData.get("showInInfoReel") === "on",
        purchasedAt: formData.get("purchasedAt")
            ? new Date(formData.get("purchasedAt") as string)
            : null,
    };

    await db.updateInventoryItem(params.itemId, updateData);

    return redirect("/inventory");
}

export default function EditInventoryItem({ loaderData }: Route.ComponentProps) {
    const item = (loaderData as any)?.item as InventoryItem;
    const navigate = useNavigate();

    const formatDateForInput = (date: Date | null) => {
        if (!date) return "";
        return new Date(date).toISOString().split("T")[0];
    };

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Muokkaa tavaraa
                    </h1>
                    <p className="text-lg text-gray-500">Edit Item</p>
                </div>

                <Form method="post" className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nimi / Name *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    required
                                    defaultValue={item.name}
                                    placeholder="Esim. Kahvinkeitin"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="quantity">Määrä / Quantity *</Label>
                                <Input
                                    id="quantity"
                                    name="quantity"
                                    type="number"
                                    min="1"
                                    required
                                    defaultValue={item.quantity}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="location">Sijainti / Location *</Label>
                                <Input
                                    id="location"
                                    name="location"
                                    required
                                    defaultValue={item.location}
                                    placeholder="Esim. Kerhohuone"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Kategoria / Category</Label>
                                <Input
                                    id="category"
                                    name="category"
                                    defaultValue={item.category || ""}
                                    placeholder="Esim. Keittiö"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Kuvaus / Description</Label>
                            <Input
                                id="description"
                                name="description"
                                defaultValue={item.description || ""}
                                placeholder="Vapaamuotoinen kuvaus"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="value">Arvo € / Value €</Label>
                                <Input
                                    id="value"
                                    name="value"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue={item.value || "0"}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchasedAt">Hankintapäivä / Purchase Date</Label>
                                <Input
                                    id="purchasedAt"
                                    name="purchasedAt"
                                    type="date"
                                    defaultValue={formatDateForInput(item.purchasedAt)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <Checkbox
                                id="showInInfoReel"
                                name="showInInfoReel"
                                defaultChecked={item.showInInfoReel}
                            />
                            <Label htmlFor="showInInfoReel" className="cursor-pointer">
                                Näytä Info Reelissä / Show in Info Reel
                            </Label>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigate(-1)}
                            className="flex-1"
                        >
                            Peruuta / Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                            Tallenna / Save
                        </Button>
                    </div>
                </Form>
            </div>
        </PageWrapper>
    );
}
