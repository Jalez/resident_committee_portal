import { useState } from "react";
import { Form, redirect, useFetcher, useSubmit } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase } from "~/db";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { buildMinutePath } from "~/lib/minutes/utils";
import type { Route } from "./+types/minutes.$minuteId.edit";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useNavigate } from "react-router";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import type { AnyEntity } from "~/lib/entity-converters";

export function meta({ data }: Route.MetaArgs) {
    return [
        {
            title: `Muokkaa pöytäkirjaa / Edit Minute`,
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

    // Load relationships using the new universal system
    const relationships = await loadRelationshipsForEntity(
        db,
        "minute",
        minute.id,
        ["reimbursement", "inventory"]
    );

    return {
        minute,
        relationships,
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

    if (intent === "update_minute") {
        const title = formData.get("title") as string;
        const description = formData.get("description") as string;
        const dateStr = formData.get("date") as string;

        let fileUrl = minute.fileUrl;
        let fileKey = minute.fileKey;

        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
            const year = new Date(dateStr).getFullYear().toString();
            const pathname = buildMinutePath(year, file.name);
            const storage = getMinuteStorage();
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

        // Save relationship changes using the new universal system
        await saveRelationshipChanges(db, "minute", minute.id, formData, null);

        return redirect("/minutes");
    }

    return null;
}

export default function MinutesEdit({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const { minute, relationships } = loaderData;
    const navigate = useNavigate();

    const [date, setDate] = useState(minute.date ? new Date(minute.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

    // Use the relationship picker hook
    const relationshipPicker = useRelationshipPicker({
        relationAType: "minute",
        relationAId: minute.id,
        initialRelationships: [
            ...((relationships.reimbursement?.linked || []) as unknown as AnyEntity[]).map((e) => ({
                relationBType: "reimbursement" as const,
                relationBId: e.id,
            })),
            ...((relationships.inventory?.linked || []) as unknown as AnyEntity[]).map((e) => ({
                relationBType: "inventory" as const,
                relationBId: e.id,
            })),
        ],
    });

    // Get form data for hidden inputs
    const relationshipFormData = relationshipPicker.toFormData();

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
                    
                    {/* Hidden inputs for relationship changes */}
                    <input
                        type="hidden"
                        name="_relationship_links"
                        value={relationshipFormData._relationship_links}
                    />
                    <input
                        type="hidden"
                        name="_relationship_unlinks"
                        value={relationshipFormData._relationship_unlinks}
                    />

                    <TreasuryDetailCard title={t("minutes.details", "Minute Details")}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="file">{t("minutes.replace_file", "Replace File (Optional)")}</Label>
                                {minute.fileUrl && minute.fileKey && (
                                    <div className="text-sm text-gray-500 mb-2">Current: <a href={minute.fileUrl} target="_blank" className="text-blue-600 underline">{minute.fileKey.split('/').pop()}</a></div>
                                )}
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
                                        defaultValue={minute.title || ""}
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

                    {/* Relationship Picker - Replaces InventoryPicker and ReimbursementsPicker */}
                    <RelationshipPicker
                        relationAType="minute"
                        relationAId={minute.id}
                        relationAName={minute.title || ""}
                        mode="edit"
                        sections={[
                            {
                                relationBType: "reimbursement",
                                linkedEntities: (relationships.reimbursement?.linked || []) as unknown as AnyEntity[],
                                availableEntities: (relationships.reimbursement?.available || []) as unknown as AnyEntity[],
                            },
                            {
                                relationBType: "inventory",
                                linkedEntities: (relationships.inventory?.linked || []) as unknown as AnyEntity[],
                                availableEntities: (relationships.inventory?.available || []) as unknown as AnyEntity[],
                            },
                        ]}
                        onLink={relationshipPicker.handleLink}
                        onUnlink={relationshipPicker.handleUnlink}
                        storageKeyPrefix="minute-picker"
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
