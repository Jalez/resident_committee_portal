import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigate } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { TreasuryDetailCard } from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { getDatabase } from "~/db";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { requirePermission } from "~/lib/auth.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
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
	await requirePermission(request, "minutes:update", getDatabase);
	const db = getDatabase();
	const minute = await db.getMinuteById(params.minuteId);
	if (!minute) {
		throw new Response("Not Found", { status: 404 });
	}

	// Load relationships using the new universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"minute",
		minute.id,
		["reimbursement", "inventory"],
	);

	// Get source context and returnUrl from URL
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	return {
		minute,
		relationships,
		sourceContext,
		returnUrl,
	};
}

export async function action() {
	// Update logic has been moved to /api/minutes/:minuteId/update
	return null;
}

export default function MinutesEdit({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const { minute, relationships, sourceContext, returnUrl } = loaderData;
	const navigate = useNavigate();

	const [date, setDate] = useState(
		minute.date
			? new Date(minute.date).toISOString().split("T")[0]
			: new Date().toISOString().split("T")[0],
	);

	// Use the relationship picker hook
	const relationshipPicker = useRelationshipPicker({
		relationAType: "minute",
		relationAId: minute.id,
		initialRelationships: [
			...(
				(relationships.reimbursement?.linked || []) as unknown as AnyEntity[]
			).map((e) => ({
				relationBType: "reimbursement" as const,
				relationBId: e.id,
			})),
			...(
				(relationships.inventory?.linked || []) as unknown as AnyEntity[]
			).map((e) => ({
				relationBType: "inventory" as const,
				relationBId: e.id,
			})),
		],
	});

	// Get form data for hidden inputs
	const relationshipFormData = relationshipPicker.toFormData();

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("minutes.edit", "Edit Minute")} />

				<Form
					method="post"
					action={`/api/minutes/${minute.id}/update`}
					encType="multipart/form-data"
					className="space-y-6"
				>
					<input type="hidden" name="intent" value="update_minute" />
					{/* Hidden fields for source context (auto-linking when created from picker) */}
					{sourceContext && (
						<>
							<input
								type="hidden"
								name="_sourceType"
								value={sourceContext.type}
							/>
							<input type="hidden" name="_sourceId" value={sourceContext.id} />
						</>
					)}
					{returnUrl && (
						<input type="hidden" name="_returnUrl" value={returnUrl} />
					)}

					{/* Hidden inputs for relationship changes */}
					<input
						type="hidden"
						name="_relationship_links"
						value={relationshipFormData._relationship_links}
					/>
					<input
						type="hidden"
						name="_relationship_unlinks"
						value={relationshipFormData._relationship_unlinks}
					/>

					<TreasuryDetailCard title={t("minutes.details", "Minute Details")}>
						<div className="space-y-4">
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
											className="text-blue-600 underline"
										>
											{minute.fileKey.split("/").pop()}
										</a>
									</div>
								)}
								<Input id="file" name="file" type="file" accept=".pdf" />
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="date">{t("minutes.date", "Date")}</Label>
									<Input
										id="date"
										name="date"
										type="date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="title">
										{t("minutes.title_field", "Title")}
									</Label>
									<Input
										id="title"
										name="title"
										type="text"
										defaultValue={minute.title || ""}
										required
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">
									{t("minutes.description", "Description")}
								</Label>
								<Textarea
									id="description"
									name="description"
									defaultValue={minute.description || ""}
								/>
							</div>
						</div>
					</TreasuryDetailCard>

					{/* Relationship Picker - Replaces InventoryPicker and ReimbursementsPicker */}
					<RelationshipPicker
						relationAType="minute"
						relationAId={minute.id}
						relationAName={minute.title || ""}
						mode="edit"
						sections={[
							{
								relationBType: "reimbursement",
								linkedEntities: (relationships.reimbursement?.linked ||
									[]) as unknown as AnyEntity[],
								availableEntities: (relationships.reimbursement?.available ||
									[]) as unknown as AnyEntity[],
							},
							{
								relationBType: "inventory",
								linkedEntities: (relationships.inventory?.linked ||
									[]) as unknown as AnyEntity[],
								availableEntities: (relationships.inventory?.available ||
									[]) as unknown as AnyEntity[],
							},
						]}
						onLink={relationshipPicker.handleLink}
						onUnlink={relationshipPicker.handleUnlink}
						storageKeyPrefix="minute-picker"
					/>

					<TreasuryFormActions
						saveLabel={t("common.actions.save", "Save")}
						onCancel={() => navigate(loaderData.returnUrl || "/minutes")}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
