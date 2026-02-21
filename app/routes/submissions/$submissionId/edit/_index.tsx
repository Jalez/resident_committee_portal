import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { SUBMISSION_STATUSES } from "~/lib/constants";

export function meta({ data }: { data?: unknown }) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.submission?.name || "Edit Submission"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({
	request,
	params,
}: {
	request: Request;
	params: Record<string, string | undefined>;
}) {
	return createEditLoader({
		entityType: "submission",
		permission: "submissions:write",
		params,
		request,
		fetchEntity: (db, id) => db.getSubmissionById(id),
	});
}

const submissionSchema = z.object({
	name: z.string().min(1, "Name is required"),
	email: z.string().min(1, "Email is required"),
	apartmentNumber: z.string().optional(),
	type: z.string().min(1),
	message: z.string().min(1, "Message is required"),
	status: z.string().min(1),
});

export async function action({
	request,
	params,
}: {
	request: Request;
	params: Record<string, string | undefined>;
}) {
	return createEditAction({
		entityType: "submission",
		permission: "submissions:write",
		params,
		request,
		schema: submissionSchema,
		fetchEntity: (db, id) => db.getSubmissionById(id),
		onUpdate: async ({ db, id, data }) => {
			return db.updateSubmission(id, {
				name: data.name,
				email: data.email,
				apartmentNumber: data.apartmentNumber || null,
				type: data.type as any,
				message: data.message,
				status: data.status as any,
			});
		},
		successRedirect: () => "/submissions?success=submission_updated",
	});
}

export default function EditSubmission({
	loaderData,
}: {
	loaderData: any;
}) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { submission, returnUrl, relationships } = loaderData as any;

	const getStatusLabel = (status: string) => {
		if (!status) return status;
		const parts = status.split(" / ");
		return i18n.language === "fi" ? parts[0] : parts[1] || parts[0];
	};

	const inputFields: Record<string, InputFieldConfig> = {
		name: {
			label: t("submissions.table.sender"),
			value: submission.name,
		},
		email: {
			label: t("profile.email_label", "Email"),
			value: submission.email,
		},
		apartmentNumber: {
			label: t("submissions.apartment"),
			value: submission.apartmentNumber || "",
		},
		type: {
			label: t("submissions.table.type"),
			value: submission.type,
			options: [
				{ value: "committee", label: t("submissions.types.committee") },
				{ value: "events", label: t("submissions.types.events") },
				{ value: "purchases", label: t("submissions.types.purchases") },
				{ value: "questions", label: t("submissions.types.questions") },
			],
		},
		message: {
			label: t("submissions.table.message"),
			value: submission.message,
		},
		status: {
			label: t("submissions.table.status"),
			value: submission.status,
			options: SUBMISSION_STATUSES.map((s) => ({
				value: s,
				label: getStatusLabel(s),
			})),
		},
	};

	return (
		<PageWrapper>
			<EditForm
				title={`${t("common.actions.edit")} - ${submission.name}`}
				action=""
				inputFields={inputFields}
				entityType="submission"
				entityId={submission.id}
				returnUrl={returnUrl || "/submissions"}
				relationships={relationships}
				onCancel={() => navigate(returnUrl || "/submissions")}
				translationNamespace="submissions"
			/>
		</PageWrapper>
	);
}
