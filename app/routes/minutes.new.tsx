import { useState, useEffect } from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigate, useNavigation, useSubmit } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper, ContentArea, SplitLayout } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type Purchase } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/minutes.new";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { FileUpload } from "~/components/ui/file-upload";
import { InventoryPicker, type InventoryPickerItem } from "~/components/treasury/pickers/inventory-picker";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { ReimbursementsPicker, reimbursementsToLinkableItems } from "~/components/treasury/pickers/reimbursements-picker";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { buildMinutePath, getMinutesPrefix } from "~/lib/minutes/utils";

// Allowed file types for minutes (PDF only)
const ALLOWED_MIME_TYPES = [
    "application/pdf",
];

function isSafePathname(pathname: string): boolean {
    const prefix = getMinutesPrefix();
    if (!pathname || !pathname.startsWith(prefix)) return false;
    if (pathname.includes("..")) return false;
    return true;
}

export function meta({ data }: Route.MetaArgs) {
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - Uusi pöytäkirja / New Minute`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "minutes:create", getDatabase);
    const db = getDatabase();

    const unlinkedReimbursements = await db.getPurchases();
    const inventoryItems = await db.getInventoryItems();

    return {
        siteConfig: SITE_CONFIG,
        unlinkedReimbursements,
        inventoryItems,
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requirePermission(request, "minutes:create", getDatabase);
    const db = getDatabase();
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const dateStr = formData.get("date") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    // Links
    const linkedReimbursementIdsRaw = formData.get("linkedReimbursementIds") as string;
    const linkedInventoryItemIdsRaw = formData.get("linkedInventoryItemIds") as string;

    const linkedReimbursementIds = linkedReimbursementIdsRaw ? JSON.parse(linkedReimbursementIdsRaw) : [];
    const linkedInventoryItemIds = linkedInventoryItemIdsRaw ? JSON.parse(linkedInventoryItemIdsRaw) : [];

    if (!file || file.size === 0) {
        return { error: "File is required" };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return { error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}` };
    }

    const date = new Date(dateStr);
    const year = date.getFullYear();
    const pathname = buildMinutePath(year.toString(), file.name);

    if (!isSafePathname(pathname)) {
        return { error: "Invalid pathname" };
    }

    // Upload
    const storage = getMinuteStorage();
    let result;
    try {
        result = await storage.uploadFile(pathname, file, {
            access: "public",
            addRandomSuffix: true,
        });
    } catch (e) {
        console.error("Upload failed", e);
        return { error: "Upload failed" };
    }

    // Create Minute
    const user = await getAuthenticatedUser(request, () => db);
    const minute = await db.createMinute({
        date,
        year,
        title,
        description: description || null,
        fileUrl: result.url,
        fileKey: result.pathname,
        createdBy: user?.userId || null,
    });

    // Create Links
    await Promise.all([
        ...linkedReimbursementIds.map((id: string) => db.createMinuteLink({ minuteId: minute.id, purchaseId: id })),
        ...linkedInventoryItemIds.map((id: string) => db.createMinuteLink({ minuteId: minute.id, inventoryItemId: id })),
    ]);

    return redirect("/minutes?success=created");
}


export default function MinutesNew({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const { unlinkedReimbursements, inventoryItems } = loaderData;
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const navigate = useNavigate();
    const submit = useSubmit();

    const isSubmitting = navigation.state === "submitting";

    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [file, setFile] = useState<File | null>(null);

    // Links State
    const [linkedPurchases, setLinkedPurchases] = useState<Purchase[]>([]);
    const [linkedInventory, setLinkedInventory] = useState<InventoryPickerItem[]>([]);

    // Filter available reimbursements
    const availableReimbursements = unlinkedReimbursements.filter((r: Purchase) => !linkedPurchases.find(lp => lp.id === r.id));

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4 pb-12">
                <PageHeader title={t("minutes.new", "New Minute")} />

                {actionData?.error && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
                        {actionData.error}
                    </div>
                )}

                <Form
                    method="post"
                    encType="multipart/form-data"
                    className="space-y-6"
                >
                    <input type="hidden" name="linkedReimbursementIds" value={JSON.stringify(linkedPurchases.map(p => p.id))} />
                    <input type="hidden" name="linkedInventoryItemIds" value={JSON.stringify(linkedInventory.map(i => i.itemId))} />

                    <TreasuryDetailCard title={t("minutes.details", "Minute Details")}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <FileUpload
                                    name="file"
                                    id="file"
                                    label={t("minutes.file", "File")}
                                    accept={[".pdf"]}
                                    helperText={t("minutes.allowed_types", "Allowed types: PDF")}
                                    required
                                    onFileChange={setFile}
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
                                        placeholder="Feb Meeting"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t("minutes.description", "Description")}</Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    placeholder="Optional description..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        </div>

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
                            storageKey="minutes-new-inventory-picker"
                        />

                        <TreasuryFormActions
                            saveLabel={t("common.actions.save", "Save")}
                            disabled={isSubmitting}
                            onCancel={() => navigate("/minutes")}
                        />
                    </TreasuryDetailCard>

                </Form>
            </div>
        </PageWrapper>
    );
}

