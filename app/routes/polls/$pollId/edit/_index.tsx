import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Label } from "~/components/ui/label";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import { getAnalyticsSheets } from "~/lib/google.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { z } from "zod";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const title = `${(data as any)?.siteConfig?.name || "Portal"} - Edit Poll`;
	return [{ title }, { name: "description", content: "Edit poll details" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "poll",
		permission: "polls:update",
		params,
		request,
		fetchEntity: (db, id) => db.getPollById(id),
		extend: async ({ db, entity: poll }) => {
			let analyticsSheets: any[] = [];
			try {
				analyticsSheets = await getAnalyticsSheets(undefined, false);
			} catch (error) {
				console.error("Failed to fetch analytics sheets:", error);
			}

			const systemLanguages = await getSystemLanguageDefaults();
			return {
				analyticsSheets,
				systemLanguages,
			};
		},
	});
}

const pollSchema = z.object({
	status: z.string(),
	analyticsSheetId: z.string().optional().nullable(),
	deadlineDate: z.string().optional().nullable(),
	deadlineTime: z.string().optional().nullable(),
	name: z.string().optional(),
	description: z.string().optional(),
	externalUrl: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "poll",
		permission: "polls:update",
		params,
		request,
		schema: pollSchema,
		fetchEntity: (db, id) => db.getPollById(id),
		onUpdate: async ({ db, id, data, newStatus, formData, entity }) => {
			// Parse deadline
			let deadline: Date | null = null;
			if (data.deadlineDate && data.deadlineTime) {
				deadline = new Date(`${data.deadlineDate}T${data.deadlineTime}`);
				if (Number.isNaN(deadline.getTime())) {
					throw new Error("Invalid deadline date/time");
				}
			}

			const updates: Record<string, any> = {
				analyticsSheetId:
					data.analyticsSheetId && data.analyticsSheetId !== "none"
						? data.analyticsSheetId
						: null,
				status: (newStatus as any) || data.status,
				deadline,
			};

			const poll = entity as any;
			if (!poll) {
				throw new Response("Not Found", { status: 404 });
			}

			if (poll.type === "external") {
				if (!data.name || !data.name.trim())
					throw new Error("Name is required");
				if (!data.externalUrl || !data.externalUrl.trim())
					throw new Error("URL is required");

				updates.name = data.name.trim();
				updates.description = data.description?.trim() || null;
				updates.externalUrl = data.externalUrl.trim();
			}

			return db.updatePoll(id, updates);
		},
		successRedirect: (entity) => `/polls`,
	});
}

export default function EditPoll({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { poll, analyticsSheets, returnUrl } = loaderData as any;

	const deadlineIso = poll.deadline ? new Date(poll.deadline).toISOString() : "";
	const defaultDate = deadlineIso ? deadlineIso.split("T")[0] : "";
	const defaultTime = deadlineIso ? deadlineIso.split("T")[1].substring(0, 5) : "";

	const inputFields: Record<string, InputFieldConfig> = {
		name: poll.type === "linked" ? { hidden: true } : poll.name,
		description: poll.type === "linked" ? { hidden: true } : poll.description || "",
		externalUrl: poll.type === "linked" ? { hidden: true } : poll.externalUrl,
		_linkedInfo: poll.type === "linked" ? {
			render: () => (
				<div className="space-y-4 mb-6 p-4 bg-muted rounded-xl">
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground uppercase tracking-wider">
							Name
						</Label>
						<div className="font-medium">{poll.name}</div>
					</div>
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground uppercase tracking-wider">
							Description
						</Label>
						<div className="text-sm whitespace-pre-wrap">
							{poll.description || "-"}
						</div>
					</div>
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground uppercase tracking-wider">
							Google Form URL
						</Label>
						<div className="text-sm truncate">
							<a
								href={poll.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-600 hover:underline"
							>
								{poll.externalUrl}
							</a>
						</div>
					</div>
				</div>
			),
		} : undefined,

		deadlineDate: {
			label: t("polls.new.deadline") + " (" + (t("common.date") || "Date") + ")",
			value: defaultDate,
		},
		deadlineTime: {
			label: t("polls.new.deadline") + " (" + (t("common.time") || "Time") + ")",
			value: defaultTime,
		},
		status: {
			value: poll.status,
			options: [
				{ value: "draft", label: t("common.status.draft") },
				{ value: "active", label: t("polls.active") || "Active" },
				{ value: "closed", label: t("polls.closed") || "Closed" },
			],
		},
		analyticsSheetId: analyticsSheets.length > 0 ? {
			label: t("polls.new.analytics_sheet"),
			value: poll.analyticsSheetId || "none",
			options: [
				{ value: "none", label: t("polls.new.no_sheet") },
				...analyticsSheets.map((s: any) => ({
					value: s.id,
					label: s.name,
				})),
			],
		} : { hidden: true },
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<EditForm
					title={t("common.actions.edit") + " Poll"}
					action=""
					inputFields={inputFields}
					entityType="poll"
					entityId={poll.id}
					returnUrl={returnUrl || "/polls"}
					onCancel={() => navigate(returnUrl || "/polls")}
					translationNamespace="polls.new"
				>
				</EditForm>
			</div>
		</PageWrapper>
	);
}
