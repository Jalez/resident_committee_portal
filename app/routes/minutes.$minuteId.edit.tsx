import { useState } from "react";
import { Form, redirect, useFetcher, useSubmit } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type MinuteLink } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { buildMinutePath } from "~/lib/minutes/utils";
import type { Route } from "./+types/minutes.$minuteId.edit";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import { InventoryPicker, type InventoryPickerItem } from "~/components/treasury/pickers/inventory-picker";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { ReimbursementsPicker, reimbursementsToLinkableItems } from "~/components/treasury/pickers/reimbursements-picker";
import type { Purchase } from "~/db/schema";
import { useNavigate } from "react-router"; // Fixed import location

export function meta({ data }: Route.MetaArgs) {
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - Muokkaa pöytäkirjaa / Edit Minute`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    await requirePermission(request, "minutes:update", getDatabase);
    const db = getDatabase();
    const minute = await db.getMinuteById(params.minuteId);
    if (!minute) {
        throw new Response("Not Found", { status: 404 });
    }

    const links = await db.getMinuteLinks(minute.id);

    // Enrich links with related data (basic implementation)
    // In a real app, we'd use a join or batch fetch.
    const enrichedLinks = await Promise.all(links.map(async (link: MinuteLink) => {
        let label = "Unknown";
        let type = "unknown";
        if (link.purchaseId) {
            type = "purchase";
            const p = await db.getPurchaseById(link.purchaseId);
            label = p ? `${p.createdAt.toISOString().split('T')[0]} - ${p.description} (${p.amount}€)` : "Unknown Purchase";
        } else if (link.newsId) {
            type = "news";
            const n = await db.getNewsById(link.newsId);
            label = n ? n.title : "Unknown News";
        } else if (link.faqId) {
            type = "faq";
            const f = await db.getFaqById(link.faqId);
            label = f ? f.question : "Unknown FAQ";
        } else if (link.inventoryItemId) {
            type = "inventory";
            // inventory item getter might differ
            // const i = await db.getInventoryItemById(link.inventoryItemId);
            // label = i ? i.name : "Unknown Item";
            label = "Inventory Item (fetching not impl yet)";
        }
        return { ...link, type, label };
    }));

    const unlinkedReimbursements = await db.getPurchases(); // Need to filter out linked ones? Or just show all?
    // Filter out reimbursements already linked to THIS minute? 
    // Actually minute_links has minuteId.
    // If a purchase is linked to ANOTHER minute, maybe still show it?
    // But usually we only link to one minute.
    // Let's just fetch all for now and filter in UI if needed, or better, db.getPurchases() returns all.
    // Ideally we'd have db.getUnlinkedPurchases().
    // For now, let's fetch all (limit?)

    const inventoryItems = await db.getInventoryItems();

    return {
        siteConfig: SITE_CONFIG,
        minute,
        links: enrichedLinks,
        unlinkedReimbursements,
        inventoryItems,
    };
}

export async function action({ request, params }: Route.ActionArgs) {
    await requirePermission(request, "minutes:update", getDatabase);
    const db = getDatabase();
    const minute = await db.getMinuteById(params.minuteId);
    if (!minute) {
        throw new Response("Not Found", { status: 404 });
    }

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "delete_link") {
        const linkId = formData.get("linkId") as string;
        await db.deleteMinuteLink(linkId);
        return { success: true };
    }

    if (intent === "update_minute") {
        const title = formData.get("title") as string;
        const description = formData.get("description") as string;
        const dateStr = formData.get("date") as string;
        const linkedReimbursementIdsRaw = formData.get("linkedReimbursementIds") as string;
        const linkedInventoryItemIdsRaw = formData.get("linkedInventoryItemIds") as string;

        const linkedReimbursementIds = linkedReimbursementIdsRaw ? JSON.parse(linkedReimbursementIdsRaw) : [];
        const linkedInventoryItemIds = linkedInventoryItemIdsRaw ? JSON.parse(linkedInventoryItemIdsRaw) : [];

        let fileUrl = minute.fileUrl;
        let fileKey = minute.fileKey;

        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
            const year = new Date(dateStr).getFullYear().toString();
            const pathname = buildMinutePath(year, file.name);
            const storage = getMinuteStorage();
            // Delete old file? Maybe not, to keep history? Or yes to save space.
            // Let's keep it simple and just upload new one.
            const result = await storage.uploadFile(pathname, file, { access: "public" });
            fileUrl = result.url;
            fileKey = result.pathname;
        }

        await db.updateMinute(minute.id, {
            title,
            description,
            date: new Date(dateStr),
            fileUrl,
            fileKey,
        });

        // Handle Links
        // 1. Get existing links
        const existingLinks = await db.getMinuteLinks(minute.id);

        // 2. Identify links to remove
        const purchaseLinksToRemove = existingLinks.filter(l => l.purchaseId && !linkedReimbursementIds.includes(l.purchaseId));
        const inventoryLinksToRemove = existingLinks.filter(l => l.inventoryItemId && !linkedInventoryItemIds.includes(l.inventoryItemId));

        // 3. Identify links to add
        const existingPurchaseIds = existingLinks.map(l => l.purchaseId).filter(Boolean);
        const existingInventoryIds = existingLinks.map(l => l.inventoryItemId).filter(Boolean);

        const purchaseIdsToAdd = linkedReimbursementIds.filter((id: string) => !existingPurchaseIds.includes(id));
        const inventoryIdsToAdd = linkedInventoryItemIds.filter((id: string) => !existingInventoryIds.includes(id));

        // 4. Execute updates
        await Promise.all([
            ...purchaseLinksToRemove.map(l => db.deleteMinuteLink(l.id)),
            ...inventoryLinksToRemove.map(l => db.deleteMinuteLink(l.id)),
            ...purchaseIdsToAdd.map((id: string) => db.createMinuteLink({ minuteId: minute.id, purchaseId: id })),
            ...inventoryIdsToAdd.map((id: string) => db.createMinuteLink({ minuteId: minute.id, inventoryItemId: id })),
        ]);

        return redirect("/minutes");
    }

    return null;
}

export default function MinutesEdit({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const { minute, links, unlinkedReimbursements, inventoryItems } = loaderData;
    const navigate = useNavigate();
    const submit = useSubmit();

    const [date, setDate] = useState(new Date(minute.date).toISOString().split("T")[0]);

    // Initialize linked items from loader data
    const [linkedPurchases, setLinkedPurchases] = useState<Purchase[]>(() => {
        const purchaseIds = links.filter((l: any) => l.type === 'purchase').map((l: any) => l.purchaseId);
        // Find full objects from unlinked (which actually contains ALL purchases in my loader logic)
        return unlinkedReimbursements.filter((p: Purchase) => purchaseIds.includes(p.id));
    });

    const [linkedInventory, setLinkedInventory] = useState<InventoryPickerItem[]>(() => {
        const invLinks = links.filter((l: any) => l.type === 'inventory');
        return invLinks.map((l: any) => {
            // We need full inventory item data. 
            // inventoryItems from loader has all of them.
            const item = inventoryItems.find((i: any) => i.id === l.inventoryItemId);
            return {
                itemId: l.inventoryItemId!,
                name: item?.name || "Unknown",
                quantity: 1, // Minute links don't have quantity
                unitValue: item ? Number(item.value) : 0,
            };
        });
    });

    // Filter out already linked for the "unlinked" list passed to pickers
    const availableReimbursements = unlinkedReimbursements.filter(r => !linkedPurchases.find(lp => lp.id === r.id));
    // Inventory picker handles filtering internally? No, it takes "availableItems" and filters out linked ones.

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4 pb-12">
                <PageHeader title={t("minutes.edit", "Edit Minute")} />

                <Form
                    method="post"
                    encType="multipart/form-data"
                    className="space-y-6"
                >
                    <input type="hidden" name="intent" value="update_minute" />
                    <input type="hidden" name="linkedReimbursementIds" value={JSON.stringify(linkedPurchases.map(p => p.id))} />
                    <input type="hidden" name="linkedInventoryItemIds" value={JSON.stringify(linkedInventory.map(i => i.itemId))} />

                    <TreasuryDetailCard title={t("minutes.details", "Minute Details")}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="file">{t("minutes.replace_file", "Replace File (Optional)")}</Label>
                                <div className="text-sm text-gray-500 mb-2">Current: <a href={minute.fileUrl} target="_blank" className="text-blue-600 underline">{minute.fileKey.split('/').pop()}</a></div>
                                <Input
                                    id="file"
                                    name="file"
                                    type="file"
                                    accept=".pdf"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date">{t("minutes.date", "Date")}</Label>
                                    <Input
                                        id="date"
                                        name="date"
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="title">{t("minutes.title_field", "Title")}</Label>
                                    <Input
                                        id="title"
                                        name="title"
                                        type="text"
                                        defaultValue={minute.title}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t("minutes.description", "Description")}</Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    defaultValue={minute.description || ""}
                                />
                            </div>
                        </div>
                    </TreasuryDetailCard>

                    {/* Reimbursements Picker */}
                    {/* Reimbursements Picker */}
                    <ReimbursementsPicker
                        multi
                        linkedReimbursements={linkedPurchases}
                        unlinkedReimbursements={availableReimbursements}
                        onMultiSelectionChange={setLinkedPurchases}
                        createUrl="/treasury/reimbursements/new"
                    />

                    {/* Inventory Picker */}
                    <InventoryPicker
                        linkedItems={linkedInventory}
                        availableItems={inventoryItems}
                        onSelectionChange={setLinkedInventory}
                        storageKey="minutes-inventory-picker"
                    />

                    <TreasuryFormActions
                        saveLabel={t("common.actions.save", "Save")}
                        onCancel={() => navigate("/minutes")}
                    />
                </Form>
            </div>
        </PageWrapper>
    );
}
