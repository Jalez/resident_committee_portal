import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import { getAuthenticatedUser, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const title = data?.minute?.title || "Minute";
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${title}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "minutes:read", getDatabase);
	const authUser = await getAuthenticatedUser(request, getDatabase);

	const db = getDatabase();
	const minute = await db.getMinuteById(params.minuteId);

	if (!minute) {
		throw new Response("Not Found", { status: 404 });
	}

	// Load relationships using universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"minute",
		minute.id,
		["reimbursement", "inventory"],
	);

	return {
		siteConfig: SITE_CONFIG,
		minute,
		relationships,
		currentUserId: authUser?.userId || null,
	};
}

export default function MinuteView({ loaderData }: Route.ComponentProps) {
	const { minute, relationships, currentUserId } = loaderData;
	const { t, i18n } = useTranslation();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");

	const canUpdate = rootData?.user?.permissions?.some(
		(p) => p === "minutes:update" || p === "*",
	);

	const formatDate = (date: Date | string | null) => {
		if (!date) return "—";
		return new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader title={t("minutes.view.title", "View Minute")} />
					{canUpdate && (
						<Button variant="default" asChild>
							<Link to={`/minutes/${minute.id}/edit`}>
								<span className="material-symbols-outlined mr-2 text-sm">
									edit
								</span>
								{t("common.actions.edit")}
							</Link>
						</Button>
					)}
				</div>

				<div className="space-y-6">
					<TreasuryDetailCard title={t("minutes.details", "Minute Details")}>
						<div className="grid gap-4">
							<TreasuryField
								label={t("minutes.title_field", "Title")}
								valueClassName="text-foreground font-semibold"
							>
								{minute.title || "—"}
							</TreasuryField>
							<TreasuryField label={t("minutes.date", "Date")}>
								{formatDate(minute.date)}
							</TreasuryField>
							{minute.description ? (
								<TreasuryField label={t("minutes.description", "Description")}>
									{minute.description}
								</TreasuryField>
							) : null}
							{minute.fileUrl && (
								<TreasuryField label={t("minutes.file", "File")}>
									<a
										href={minute.fileUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center text-primary hover:underline font-medium"
									>
										<span className="material-symbols-outlined mr-2 text-base">
											description
										</span>
										{minute.fileKey?.split("/").pop() ||
											t("minutes.view_file", "View File")}
									</a>
								</TreasuryField>
							)}
						</div>

						<RelationshipPicker
							relationAType="minute"
							relationAId={minute.id}
							relationAName={minute.title || ""}
							mode="view"
							sections={[
								{
									relationBType: "reimbursement",
									linkedEntities: (relationships.reimbursement?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: [],
								},
								{
									relationBType: "inventory",
									linkedEntities: (relationships.inventory?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: [],
								},
							]}
						/>
					</TreasuryDetailCard>

					<div className="flex justify-start">
						<Button variant="ghost" asChild>
							<Link to="/minutes" className="flex items-center">
								<span className="material-symbols-outlined mr-2">
									arrow_back
								</span>
								{t("common.actions.back")}
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
