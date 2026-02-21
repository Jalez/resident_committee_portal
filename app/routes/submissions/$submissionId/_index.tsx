import { useTranslation } from "react-i18next";
import { useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: { data: any }) {
	const name = data?.submission?.name || "Submission";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${name}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({
	request,
	params,
}: {
	request: Request;
	params: { submissionId: string };
}) {
	const authUser = await getAuthenticatedUser(request, getDatabase);
	return createViewLoader({
		entityType: "submission",
		permission: "submissions:read",
		params,
		request,
		fetchEntity: (db, id) => db.getSubmissionById(id),
		extend: async () => ({
			currentUserId: authUser?.userId || null,
		}),
	});
}

export default function ViewSubmission({
	loaderData,
}: { loaderData: any }) {
	const { submission, relationships } = loaderData;
	const { t, i18n } = useTranslation();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");

	const canUpdate = rootData?.user?.permissions?.some(
		(p) => p === "submissions:write" || p === "*",
	);

	const getStatusLabel = (status: string) => {
		if (!status) return status;
		const parts = status.split(" / ");
		return i18n.language === "fi" ? parts[0] : parts[1] || parts[0];
	};

	const displayFields = {
		name: { value: submission.name, label: t("submissions.table.sender") },
		email: { value: submission.email, label: t("profile.email_label", "Email") },
		apartmentNumber: {
			value: submission.apartmentNumber,
			label: t("submissions.apartment"),
			hide: !submission.apartmentNumber,
		},
		type: {
			value: t(`submissions.types.${submission.type}`, {
				defaultValue: submission.type,
			}),
			label: t("submissions.table.type"),
		},
		message: {
			value: submission.message,
			label: t("submissions.table.message"),
		},
		status: {
			value: getStatusLabel(submission.status),
			label: t("submissions.table.status"),
		},
		createdAt: {
			value: submission.createdAt,
			type: "date",
			label: t("submissions.table.time"),
		},
	};

	return (
		<PageWrapper>
			<ViewForm
				title={submission.name || "Submission"}
				entityType="submission"
				entityId={submission.id}
				entityName={submission.name}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/submissions"
				canEdit={canUpdate}
				canDelete={canUpdate}
				translationNamespace="submissions"
			/>
		</PageWrapper>
	);
}
