import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { ColoredStatusLinkBadge } from "~/components/colored-status-link-badge";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import {
	TREASURY_TABLE_STYLES,
	TreasuryTable,
} from "~/components/treasury/treasury-table";
import {
	type EntityRelationship,
	getDatabase,
	type Minute,
} from "~/db/server.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Pöytäkirjat / Minutes`,
		},
		{ name: "robots", content: "noindex" } as const,
	];
}

export async function loader({ request }: Route.LoaderArgs) {


	console.log("loader for minutes");
	const user = await requireAnyPermission(
		request,
		["minutes:read", "minutes:write"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);
	console.log("user", user);

	const canWrite = hasAnyPermission(user, ["minutes:write"]);
	const canUpdate = hasAnyPermission(user, ["minutes:update"]);
	const canDelete = hasAnyPermission(user, ["minutes:delete"]);

	const systemLanguages = await getSystemLanguageDefaults();
	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	let allMinutes = await db.getMinutes();

	if (yearParam && yearParam !== "all") {
		allMinutes = allMinutes.filter((m) => m.year === year);
	}

	const sortedMinutes = allMinutes.sort(
		(a, b) =>
			new Date(b.date || b.createdAt).getTime() -
			new Date(a.date || a.createdAt).getTime(),
	);

	const creatorIds = [
		...new Set(
			sortedMinutes
				.map((m) => m.createdBy)
				.filter((id): id is string => Boolean(id)),
		),
	];
	const creatorUsers = await Promise.all(
		creatorIds.map((id) => db.findUserById(id)),
	);
	const creatorsMap = new Map<string, string>();
	creatorIds.forEach((id, i) => {
		if (creatorUsers[i]) creatorsMap.set(id, creatorUsers[i].name);
	});

	const years = [
		...new Set(
			allMinutes.map((m) => m.year).filter((y): y is number => Boolean(y)),
		),
	].sort((a, b) => b - a);

	return {
		siteConfig: SITE_CONFIG,
		canWrite,
		canUpdate,
		canDelete,
		systemLanguages,
		minutes: sortedMinutes,
		years,
		currentYear: year,
		creatorsMap: Object.fromEntries(creatorsMap),
	};
}

export default function Minutes({ loaderData }: Route.ComponentProps) {
	const {
		minutes,
		years,
		systemLanguages,
		creatorsMap: creatorsMapRaw,
		canWrite,
		canUpdate,
		canDelete,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const [searchParams, setSearchParams] = useSearchParams();
	const { t, i18n } = useTranslation();

	useEffect(() => {
		const success = searchParams.get("success");
		if (success === "minute_created") {
			toast.success(t("minutes.success.minute_created"));
		}
		if (success === "minute_updated") {
			toast.success(t("minutes.success.minute_updated"));
		}
		if (success) {
			setSearchParams((prev) => {
				prev.delete("success");
				return prev;
			});
		}
	}, [searchParams, setSearchParams, t]);

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);

	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("common.fields.year"),
			type: "select",
			placeholder: t("minutes.select_year"),
			options:
				years.length > 0
					? ["all", ...years.map(String)]
					: [String(new Date().getFullYear())],
		},
	];

	const footerContent = (
		<div className="flex flex-wrap items-center gap-2 min-h-[40px]">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					title={t("minutes.add")}
					variant="icon"
					createType="minute"
				/>
			)}
		</div>
	);

	const columns = [
		{
			key: "date",
			header: t("common.fields.date"),
			cell: (row: Minute) => (row.date ? formatDate(row.date) : "—"),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "title",
			header: t("common.fields.title"),
			cell: (row: Minute) => row.title || "—",
			cellClassName: "font-medium",
		},
		{
			key: "description",
			header: t("common.fields.description"),
			cell: (row: Minute) => row.description || "—",
			cellClassName: "text-gray-500",
		},
		{
			key: "file",
			header: t("minutes.file"),
			cell: (row: Minute) => {
				if (!row.fileUrl) return <span className="text-gray-400">—</span>;
				return (
					<a
						href={row.fileUrl}
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline flex items-center gap-1"
					>
						<span className="material-symbols-outlined text-sm">
							description
						</span>
						{row.fileKey?.split("/").pop() || "PDF"}
					</a>
				);
			},
		},
		{
			key: "createdBy",
			header: t("common.fields.created_by"),
			cell: (row: Minute) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500",
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("minutes.title", {
						lng: systemLanguages.primary,
					}),
					secondary: t("minutes.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={footerContent}
			>
				<div className="space-y-6">
					<TreasuryTable<Minute>
						data={minutes}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(minute) => (
							<TreasuryActionCell
								viewTo={`/minutes/${minute.id}`}
								viewTitle={t("minutes.view")}
								editTo={canUpdate ? `/minutes/${minute.id}/edit` : undefined}
								editTitle={t("common.actions.edit")}
								canEdit={canUpdate}
								deleteProps={
									canDelete
										? {
											action: `/minutes/${minute.id}/delete`,
											hiddenFields: {},
											confirmMessage: t("minutes.delete_confirm"),
											title: t("common.actions.delete"),
										}
										: undefined
								}
							/>
						)}
						emptyState={{
							title: t("minutes.no_minutes"),
						}}
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
