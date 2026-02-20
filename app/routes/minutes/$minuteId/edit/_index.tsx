import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActionData, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useFileUpload } from "~/hooks/use-file-upload";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import {
	deleteOldFile,
	extractYearFromPath,
	handleFileUpload,
} from "~/lib/file-upload.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - Muokkaa pöytäkirjaa / Edit Minute`,
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
		onUpdate: async ({ db, id, data, formData, entity, newStatus }) => {
			const date = data.date ? new Date(data.date) : null;
			const extractedYear = extractYearFromPath(entity.fileKey);
			const year: number | undefined =
				date?.getFullYear() ||
				(extractedYear ? parseInt(extractedYear, 10) : undefined);

			const uploadResult = await handleFileUpload({
				formData,
				entityType: "minute",
				entity: {
					id: entity.id,
					fileUrl: entity.fileUrl,
					fileKey: entity.fileKey,
				},
				name: data.title,
				year: year?.toString(),
			});

			if ("error" in uploadResult) {
				const errorMessage =
					uploadResult.error === "invalid_file_type"
						? `Invalid file type. Allowed: ${uploadResult.allowedTypes || ".pdf, .doc, .docx, .txt"}`
						: uploadResult.error === "storage_not_available"
							? "File storage is not available right now. Please try again later."
							: uploadResult.error === "upload_failed"
								? uploadResult.message || "File upload failed. Please try again."
								: uploadResult.message ||
								"Could not process the selected file. Please try again.";
				return { error: errorMessage };
			}

			if (uploadResult.pathname && uploadResult.pathname !== entity.fileKey) {
				await deleteOldFile("minute", entity.fileKey);
			}

			return db.updateMinute(id, {
				date: date,
				year: year,
				title: data.title,
				description: data.description || null,
				fileUrl: uploadResult.url || entity.fileUrl,
				fileKey: uploadResult.pathname || entity.fileKey,
				status: (newStatus as any) || (data as any).status || entity.status,
			});
		},
		successRedirect: () => `/minutes?success=minute_updated`,
	});
}

export default function MinutesEdit({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const { minute, relationships, sourceContext, returnUrl } = loaderData as any;
	const navigate = useNavigate();
	const actionData = useActionData<typeof action>();
	const lastActionSignatureRef = useRef<string | null>(null);

	const [date, setDate] = useState(
		minute.date
			? new Date(minute.date).toISOString().split("T")[0]
			: new Date().toISOString().split("T")[0],
	);
	const [title, setTitle] = useState(minute.title || "");
	const [description, setDescription] = useState(minute.description || "");

	const year = date
		? new Date(date).getFullYear().toString()
		: new Date().getFullYear().toString();

	const {
		isUploading,
		selectedFile,
		tempUrl,
		tempPathname,
		handleFileChange,
		handleCancel,
	} = useFileUpload({
		entityType: "minute",
		entityId: minute.id,
		year,
	});

	useEffect(() => {
		if (!actionData) return;

		const signature = JSON.stringify(actionData);
		if (signature === lastActionSignatureRef.current) return;
		lastActionSignatureRef.current = signature;

		if ((actionData as any).error) {
			toast.error((actionData as any).error as string);
		} else if ((actionData as any).fieldErrors) {
			const errorMessages = Object.values((actionData as any).fieldErrors)
				.flat()
				.join(", ");
			toast.error(errorMessages || t("common.error.validation_failed"));
		}
	}, [actionData, t]);

	const inputFields = React.useMemo(
		() => ({
			date: {
				label: t("minutes.date"),
				value: date,
			},
			title: {
				label: t("minutes.minute_title"),
				value: title,
			},
			description: {
				label: t("minutes.description"),
				value: description,
			},
			file: {
				label: t("minutes.file", "File"),
				render: () => (
					<div className="space-y-3">
						<Label htmlFor="file">
							{t("minutes.replace_file", "Replace File (Optional)")}
						</Label>
						{(minute.fileUrl || tempUrl) && (
							<div className="text-sm text-gray-500">
								{t("minutes.current_file", "Current")}:{" "}
								<a
									href={tempUrl || minute.fileUrl}
									target="_blank"
									rel="noreferrer"
									className="text-blue-600 underline hover:text-blue-800"
								>
									{(tempPathname || minute.fileKey)?.split("/").pop()}
								</a>
							</div>
						)}
						{tempUrl && selectedFile && (
							<div className="flex items-center gap-2 text-sm text-green-600">
								<span className="material-symbols-outlined text-sm">
									check_circle
								</span>
								{t("files.new_file_selected", "New file selected")}:{" "}
								{selectedFile.name}
							</div>
						)}
						<Input
							id="file"
							name="file"
							type="file"
							accept=".pdf,.doc,.docx,.txt"
							disabled={isUploading}
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) handleFileChange(file);
							}}
						/>
						{isUploading && (
							<div className="flex items-center gap-2 text-sm text-gray-500">
								<span className="material-symbols-outlined animate-spin">
									progress_activity
								</span>
								{t("files.uploading", "Uploading...")}
							</div>
						)}
					</div>
				),
			},
		}),
		[
			date,
			title,
			description,
			minute.fileUrl,
			minute.fileKey,
			tempUrl,
			tempPathname,
			selectedFile,
			isUploading,
			handleFileChange,
			t,
		],
	);

	return (
		<PageWrapper>
			<EditForm
				title={t("minutes.edit", "Edit Minute")}
				action=""
				encType="multipart/form-data"
				inputFields={inputFields as any}
				entityType="minute"
				entityId={minute.id}
				returnUrl={returnUrl || "/minutes"}
				onCancel={() => {
					handleCancel();
					navigate(returnUrl || "/minutes");
				}}
				relationships={relationships}
				deleteUrl={ENTITY_REGISTRY.minute.deleteUrl(minute.id)}
				submitDisabled={isUploading}
				hiddenFields={{
					_sourceType: sourceContext?.type,
					_sourceId: sourceContext?.id,
					_returnUrl: returnUrl,
					tempUrl: tempUrl,
					tempPathname: tempPathname,
				}}
				onFieldChange={(name, value) => {
					if (name === "date") setDate(value);
					if (name === "title") setTitle(value);
					if (name === "description") setDescription(value);
				}}
				translationNamespace="minutes"
			/>
		</PageWrapper>
	);
}
