import { useTranslation } from "react-i18next";
import { Form, Link } from "react-router";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { RelationsColumn } from "~/components/relations-column";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import {
	TREASURY_TABLE_STYLES,
	TreasuryTable,
} from "~/components/treasury/treasury-table";
import {
	getDatabase,
	type Submission,
	type SubmissionStatus,
} from "~/db/server.server";
import { hasPermission, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SUBMISSION_STATUSES } from "~/lib/constants";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Yhteydenotot / Submissions`,
		},
		{ name: "robots", content: "noindex" },
	];
}

const SUBMISSION_TYPES = ["committee", "events", "purchases", "questions"];

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requirePermission(
		request,
		"submissions:read",
		getDatabase,
	);
	const db = getDatabase();
	const submissions = await db.getSubmissions();
	const url = new URL(request.url);
	const typeFilter = url.searchParams.get("type") || "";
	const statusFilter = url.searchParams.get("status") || "";
	const q = (url.searchParams.get("q") || "").trim().toLowerCase();

	let filtered = submissions;
	if (typeFilter && typeFilter !== "all") {
		filtered = filtered.filter((s) => s.type === typeFilter);
	}
	if (statusFilter && statusFilter !== "all") {
		filtered = filtered.filter((s) => s.status === statusFilter);
	}
	if (q) {
		filtered = filtered.filter(
			(s) =>
				s.name.toLowerCase().includes(q) ||
				s.email.toLowerCase().includes(q) ||
				s.message.toLowerCase().includes(q),
		);
	}

	// Sort by createdAt descending (newest first)
	const sortedSubmissions = filtered.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const relationsMap = await loadRelationsMapForEntities(
		db,
		"submission",
		sortedSubmissions.map((s) => s.id),
		undefined,
		user.permissions,
	);
	const serializedRelationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, relations] of relationsMap) {
		serializedRelationsMap[id] = relations;
	}

	const canWrite = hasPermission(user, "submissions:write");
	const canDelete = hasPermission(user, "submissions:delete");
	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		submissions: sortedSubmissions,
		canWrite,
		canDelete,
		systemLanguages,
		relationsMap: serializedRelationsMap,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(
		request,
		"submissions:write",
		getDatabase,
	);
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;
	const submissionId = formData.get("submissionId") as string;

	if (actionType === "delete" && submissionId) {
		if (!hasPermission(user, "submissions:delete")) {
			throw new Response("Forbidden - Missing submissions:delete permission", {
				status: 403,
			});
		}
		await db.deleteSubmission(submissionId);
	} else if (actionType === "status" || !actionType) {
		const newStatus = formData.get("status") as SubmissionStatus;
		if (submissionId && newStatus) {
			await db.updateSubmissionStatus(submissionId, newStatus);
		}
	}

	return { success: true };
}

// Type badge colors
const TYPE_COLORS: Record<string, string> = {
	committee:
		"bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
	events:
		"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
	purchases:
		"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
	questions:
		"bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
	"Uusi / New":
		"bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
	"Käsittelyssä / In Progress":
		"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
	"Hyväksytty / Approved":
		"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
	"Hylätty / Rejected":
		"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
	"Valmis / Done":
		"bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function Submissions({ loaderData }: Route.ComponentProps) {
	const {
		submissions,
		canWrite,
		canDelete,
		systemLanguages,
		relationsMap: relationsMapRaw,
	} = loaderData;
	const { t, i18n } = useTranslation();
	const relationsMap = new Map(
		Object.entries(relationsMapRaw ?? {}) as [string, RelationBadgeData[]][],
	);

	const getStatusLabel = (status: string) => {
		if (!status) return status;
		const parts = status.split(" / ");
		return i18n.language === "fi" ? parts[0] : parts[1] || parts[0];
	};

	const statusTranslationKeys: Record<string, string> = {
		"Uusi / New": "submissions.statuses.new",
		"Käsittelyssä / In Progress": "submissions.statuses.in_progress",
		"Hyväksytty / Approved": "submissions.statuses.approved",
		"Hylätty / Rejected": "submissions.statuses.rejected",
		"Valmis / Done": "submissions.statuses.done",
	};

	const searchFields: SearchField[] = [
		{
			name: "q",
			label: t("submissions.search_placeholder", "Search..."),
			type: "text",
			placeholder: t("submissions.search_placeholder", "Search..."),
		},
		{
			name: "type",
			label: t("submissions.table.type"),
			type: "select",
			placeholder: t("submissions.table.type"),
			options: [
				{ value: "all", label: t("submissions.filter_all") },
				...SUBMISSION_TYPES.map((type) => ({
					value: type,
					label: t(`submissions.types.${type}`, { defaultValue: type }),
				})),
			],
		},
		{
			name: "status",
			label: t("submissions.table.status"),
			type: "select",
			placeholder: t("submissions.table.status"),
			options: [
				{ value: "all", label: t("submissions.filter_all") },
				...SUBMISSION_STATUSES.map((status) => ({
					value: status,
					label: t(statusTranslationKeys[status] || status),
				})),
			],
		},
	];

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2 min-h-[40px]">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					title={t("submissions.add", "New Submission")}
					variant="icon"
					createType="submission"
				/>
			)}
		</div>
	);

	const columns = [
		{
			key: "createdAt",
			header: t("submissions.table.time"),
			cell: (row: Submission) =>
				new Date(row.createdAt).toLocaleDateString(i18n.language, {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				}),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "type",
			header: t("submissions.table.type"),
			cell: (row: Submission) => (
				<span
					className={cn(
						"px-2 py-1 rounded-full text-xs font-bold uppercase",
						TYPE_COLORS[row.type] || "bg-gray-100 text-gray-700",
					)}
				>
					{t(`submissions.types.${row.type}`, {
						defaultValue: row.type,
					})}
				</span>
			),
		},
		{
			key: "sender",
			header: t("submissions.table.sender"),
			cell: (row: Submission) => (
				<div>
					<Link
						to={`/submissions/${row.id}`}
						className="font-medium text-foreground hover:text-primary transition-colors"
					>
						{row.name}
					</Link>
					<p className="text-sm text-muted-foreground">{row.email}</p>
					{row.apartmentNumber && (
						<p className="text-xs text-muted-foreground/70">
							{t("submissions.apartment")}: {row.apartmentNumber}
						</p>
					)}
				</div>
			),
		},
		{
			key: "message",
			header: t("submissions.table.message"),
			cell: (row: Submission) => (
				<p className="text-sm text-muted-foreground line-clamp-2 max-w-md">
					{row.message}
				</p>
			),
		},
		{
			key: "relations",
			header: t("common.relations.title"),
			cell: (row: Submission) => (
				<RelationsColumn relations={relationsMap.get(row.id) || []} />
			),
			cellClassName: "min-w-[170px]",
		},
		{
			key: "status",
			header: t("submissions.table.status"),
			cell: (row: Submission) => (
				<Form method="post" className="flex items-center">
					<input type="hidden" name="_action" value="status" />
					<input type="hidden" name="submissionId" value={row.id} />
					<select
						name="status"
						defaultValue={row.status}
						onChange={(e) => e.target.form?.requestSubmit()}
						className={cn(
							"px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors",
							STATUS_COLORS[row.status] || "bg-gray-100",
						)}
					>
						{SUBMISSION_STATUSES.map((status) => (
							<option key={status} value={status}>
								{getStatusLabel(status)}
							</option>
						))}
					</select>
				</Form>
			),
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("submissions.title", { lng: systemLanguages.primary }),
					secondary: t("submissions.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={footerContent}
			>
				<div className="space-y-6">
					<TreasuryTable<Submission>
						data={submissions}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(submission) => (
							<TreasuryActionCell
								viewTo={`/submissions/${submission.id}`}
								viewTitle={t("common.actions.view", "View")}
								editTo={
									canWrite
										? `/submissions/${submission.id}/edit`
										: undefined
								}
								editTitle={t("common.actions.edit")}
								canEdit={canWrite}
								deleteProps={
									canDelete
										? {
												action: `/submissions/${submission.id}/delete`,
												hiddenFields: {},
												confirmMessage: t("submissions.delete_confirm"),
												title: t("common.actions.delete"),
											}
										: undefined
								}
							/>
						)}
						emptyState={{
							title: t("submissions.no_submissions"),
						}}
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
