import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { z } from "zod";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
    return [
        {
            title: `Muokkaa pöytäkirjaa / Edit Minute`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    return createEditLoader({
        entityType: "minute",
        permission: "minutes:update",
        params,
        request,
        fetchEntity: (db, id) => db.getMinuteById(id),
        relationshipTypes: ["reimbursement", "inventory"],
    });
}

const minuteSchema = z.object({
    date: z.string().min(1, "Date is required"),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    status: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
    return createEditAction({
        entityType: "minute",
        permission: "minutes:update",
        params,
        request,
        schema: minuteSchema,
        fetchEntity: (db, id) => db.getMinuteById(id),
        onUpdate: async ({ db, id, data, formData, newStatus }) => {
            // File handling is implicitly done by db adapter or inherited form handling if applicable
            // If explicit file handling existed here before, ensure it's maintained if needed.
            // In the previous version, it only updated fields.
            return db.updateMinute(id, {
                ...data,
                status: (newStatus as any) || (data as any).status,
            });
        },
        successRedirect: (entity) => `/minutes?success=Minute updated`,
    });
}

export default function MinutesEdit({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const { minute, relationships, sourceContext, returnUrl } = loaderData as any;
    const navigate = useNavigate();

    const [date, setDate] = useState(
        minute.date
            ? new Date(minute.date).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
    );

    const inputFields = {
        date: {
            value: date,
            // Keep date state update for potential local usage, though EditForm manages its own state
        },
        title: minute.title,
        description: minute.description,
        file: {
            label: t("minutes.file", "File"),
            render: () => (
                <div className="space-y-2">
                    <Label htmlFor="file">
                        {t("minutes.replace_file", "Replace File (Optional)")}
                    </Label>
                    {minute.fileUrl && minute.fileKey && (
                        <div className="text-sm text-gray-500 mb-2">
                            Current:{" "}
                            <a
                                href={minute.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline"
                            >
                                {minute.fileKey.split("/").pop()}
                            </a>
                        </div>
                    )}
                    <Input id="file" name="file" type="file" accept=".pdf" />
                </div>
            )
        }
    };

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4 pb-12">
                <EditForm
                    title={t("minutes.edit", "Edit Minute")}
                    action=""
                    encType="multipart/form-data"
                    inputFields={inputFields as any}
                    entityType="minute"
                    entityId={minute.id}
                    returnUrl={returnUrl || "/minutes"}
                    onCancel={() => navigate(returnUrl || "/minutes")}
                    relationships={relationships}
                    hiddenFields={{
                        _sourceType: sourceContext?.type,
                        _sourceId: sourceContext?.id,
                    }}
                    onFieldChange={(name, value) => {
                        if (name === "date") setDate(value);
                    }}
                    translationNamespace="minutes"
                >
                </EditForm>
            </div>
        </PageWrapper>
    );
}
