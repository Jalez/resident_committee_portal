import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { getDatabase } from "~/db/server";
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
					<Card>
						<CardHeader>
							<CardTitle>{t("minutes.details", "Minute Details")}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-4">
								<div>
									<Label className="text-muted-foreground">
										{t("minutes.title_field", "Title")}
									</Label>
									<div className="text-foreground font-semibold">
										{minute.title || "—"}
									</div>
								</div>
								<div>
									<Label className="text-muted-foreground">
										{t("minutes.date", "Date")}
									</Label>
									<div className="font-medium">{formatDate(minute.date)}</div>
								</div>
								{minute.description ? (
									<div>
										<Label className="text-muted-foreground">
											{t("minutes.description", "Description")}
										</Label>
										<div className="font-medium">{minute.description}</div>
									</div>
								) : null}
								{minute.fileUrl && (
									<div>
										<Label className="text-muted-foreground">
											{t("minutes.file", "File")}
										</Label>
										<div className="font-medium">
											<a
												href={minute.fileUrl}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center text-primary hover:underline"
											>
												<span className="material-symbols-outlined mr-2 text-base">
													description
												</span>
												{minute.fileKey?.split("/").pop() ||
													t("minutes.view_file", "View File")}
											</a>
										</div>
									</div>
								)}
							</div>

							<div className="space-y-4">
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
							</div>
						</CardContent>
					</Card>

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
