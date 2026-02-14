import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { EmptyState } from "~/components/ui/empty-state";
import {
	getDatabase,
	type Submission,
	type SubmissionStatus,
} from "~/db/server.server";
import { hasPermission, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SUBMISSION_STATUSES } from "~/lib/constants";
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

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requirePermission(
		request,
		"submissions:read",
		getDatabase,
	);
	const db = getDatabase();
	const submissions = await db.getSubmissions();

	// Sort by createdAt descending (newest first)
	const sortedSubmissions = submissions.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		session: user,
		submissions: sortedSubmissions,
		canDelete: hasPermission(user, "submissions:delete"),
		systemLanguages,
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
		// Check for delete permission
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
	events: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
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
	const { session, submissions, canDelete, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();

	const getStatusLabel = (status: string) => {
		if (!status) return status;
		const parts = status.split(" / ");
		return i18n.language === "fi" ? parts[0] : parts[1] || parts[0];
	};

	const [deleteConfirmSubmissionId, setDeleteConfirmSubmissionId] = useState<
		string | null
	>(null);
	const deleteFormRef = useRef<HTMLFormElement>(null);

	return (
		<PageWrapper>
			{canDelete && (
				<Form method="post" className="hidden" ref={deleteFormRef}>
					<input type="hidden" name="_action" value="delete" />
					<input
						type="hidden"
						name="submissionId"
						value={deleteConfirmSubmissionId ?? ""}
					/>
				</Form>
			)}
			<ConfirmDialog
				open={deleteConfirmSubmissionId !== null}
				onOpenChange={(open) => !open && setDeleteConfirmSubmissionId(null)}
				title={t("common.actions.delete")}
				description={t("submissions.delete_confirm")}
				confirmLabel={t("common.actions.delete")}
				cancelLabel={t("common.actions.cancel")}
				variant="destructive"
				onConfirm={() => {
					deleteFormRef.current?.requestSubmit();
					setDeleteConfirmSubmissionId(null);
				}}
			/>
			<SplitLayout
				header={{
					primary: t("submissions.title", { lng: systemLanguages.primary }),
					secondary: t("submissions.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={
					<div className="text-right">
						<p className="text-sm font-medium text-gray-900 dark:text-white">
							{session.name || session.email}
						</p>
						<p className="text-xs text-gray-500">{session.email}</p>
					</div>
				}
			>
				{/* Submissions List - Card View for Mobile */}
				<div className="space-y-4 md:hidden mb-8">
					{submissions.length === 0 ? (
						<EmptyState message={t("submissions.no_submissions")} icon="mail" />
					) : (
						submissions.map((submission) => (
							<div
								key={submission.id}
								className="bg-card p-4 rounded-xl shadow-sm border border-border space-y-4"
							>
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground font-medium">
										{new Date(submission.createdAt).toLocaleDateString(
											i18n.language,
											{
												day: "numeric",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											},
										)}
									</span>
									<span
										className={cn(
											"px-2 py-1 rounded-full text-xs font-bold uppercase",
											TYPE_COLORS[submission.type] ||
												"bg-gray-100 text-gray-700",
										)}
									>
										{t(`contact.types.${submission.type}.title`, {
											defaultValue: submission.type,
										})}
									</span>
								</div>

								<div>
									<h3 className="font-bold text-foreground">
										{submission.name}
									</h3>
									<p className="text-sm text-muted-foreground">
										{submission.email}
									</p>
									{submission.apartmentNumber && (
										<p className="text-xs text-muted-foreground/70 mt-0.5">
											{t("submissions.apartment")}: {submission.apartmentNumber}
										</p>
									)}
								</div>

								<div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
									{submission.message}
								</div>

								<div className="flex items-center justify-between pt-2 border-t border-border">
									<Form method="post" className="flex-1 mr-4">
										<input type="hidden" name="_action" value="status" />
										<input
											type="hidden"
											name="submissionId"
											value={submission.id}
										/>
										<select
											name="status"
											defaultValue={submission.status}
											onChange={(e) => e.target.form?.requestSubmit()}
											className={cn(
												"w-full px-3 py-2 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors appearance-none",
												STATUS_COLORS[submission.status] || "bg-gray-100",
											)}
										>
											{SUBMISSION_STATUSES.map((status) => (
												<option key={status} value={status}>
													{getStatusLabel(status)}
												</option>
											))}
										</select>
									</Form>

									{canDelete && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 h-9 w-9"
											title={t("common.actions.delete")}
											onClick={() =>
												setDeleteConfirmSubmissionId(submission.id)
											}
										>
											<span className="material-symbols-outlined text-xl">
												delete
											</span>
										</Button>
									)}
								</div>
							</div>
						))
					)}
				</div>

				{/* Submissions Table */}
				<div className="hidden md:block bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="bg-muted/50">
								<tr>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
										{t("submissions.table.time")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
										{t("submissions.table.type")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
										{t("submissions.table.sender")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
										{t("submissions.table.message")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
										{t("submissions.table.status")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{submissions.length === 0 ? (
									<tr>
										<td colSpan={5} className="p-0">
											<EmptyState
												message={t("submissions.no_submissions")}
												icon="mail"
											/>
										</td>
									</tr>
								) : (
									submissions.map((submission) => (
										<SubmissionRow
											key={submission.id}
											submission={submission}
											canDelete={canDelete}
											onDeleteClick={
												canDelete ? setDeleteConfirmSubmissionId : undefined
											}
										/>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}

function SubmissionRow({
	submission,
	canDelete,
	onDeleteClick,
}: {
	submission: Submission;
	canDelete?: boolean;
	onDeleteClick?: (id: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const formattedDate = new Date(submission.createdAt).toLocaleDateString(
		i18n.language,
		{
			day: "numeric",
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
		},
	);

	const getStatusLabel = (status: string) => {
		if (!status) return status;
		const parts = status.split(" / ");
		return i18n.language === "fi" ? parts[0] : parts[1] || parts[0];
	};

	return (
		<tr className="hover:bg-muted/50 transition-colors">
			<td className="px-4 py-4 whitespace-nowrap text-sm text-muted-foreground">
				{formattedDate}
			</td>
			<td className="px-4 py-4 whitespace-nowrap">
				<span
					className={cn(
						"px-2 py-1 rounded-full text-xs font-bold uppercase",
						TYPE_COLORS[submission.type] || "bg-gray-100 text-gray-700",
					)}
				>
					{t(`contact.types.${submission.type}.title`, {
						defaultValue: submission.type,
					})}
				</span>
			</td>
			<td className="px-4 py-4">
				<p className="font-medium text-foreground">{submission.name}</p>
				<p className="text-sm text-muted-foreground">{submission.email}</p>
				{submission.apartmentNumber && (
					<p className="text-xs text-muted-foreground/70">
						{t("submissions.apartment")}: {submission.apartmentNumber}
					</p>
				)}
			</td>
			<td className="px-4 py-4 max-w-md">
				<p className="text-sm text-muted-foreground line-clamp-2">
					{submission.message}
				</p>
			</td>
			<td className="px-4 py-4">
				<div className="flex items-center gap-2">
					<Form method="post" className="flex items-center">
						<input type="hidden" name="_action" value="status" />
						<input type="hidden" name="submissionId" value={submission.id} />
						<select
							name="status"
							defaultValue={submission.status}
							onChange={(e) => e.target.form?.requestSubmit()}
							className={cn(
								"px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors",
								STATUS_COLORS[submission.status] || "bg-gray-100",
							)}
						>
							{SUBMISSION_STATUSES.map((status) => (
								<option key={status} value={status}>
									{getStatusLabel(status)}
								</option>
							))}
						</select>
					</Form>
					{canDelete && onDeleteClick && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 h-9 w-9"
							title={t("common.actions.delete")}
							onClick={() => onDeleteClick(submission.id)}
						>
							<span className="material-symbols-outlined text-xl">delete</span>
						</Button>
					)}
				</div>
			</td>
		</tr>
	);
}
