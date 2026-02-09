import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { getDatabase, type NewInventoryItem } from "~/db";
import i18next from "~/i18next.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import type { Route } from "./+types/inventory.$itemId.edit";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.metaTitle || "Muokkaa tavaraa / Edit Item"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();
	const t = await i18next.getFixedT(request, "common");

	const item = await db.getInventoryItemById(params.itemId);
	if (!item) {
		throw new Response("Not Found", { status: 404 });
	}

	const itemName = item.name;
	const title = itemName
		? `${t("inventory.form.title_edit")}: ${itemName}`
		: t("inventory.form.title_edit");

	// Get source context from URL (for auto-linking when created from picker)
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	return {
		siteConfig: SITE_CONFIG,
		item,
		metaTitle: title,
		sourceContext,
		returnUrl,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();

	const formData = await request.formData();

	const updateData: Partial<Omit<NewInventoryItem, "id">> = {
		name: formData.get("name") as string,
		quantity: parseInt(formData.get("quantity") as string, 10) || 1,
		location: formData.get("location") as string,
		category: (formData.get("category") as string) || null,
		description: (formData.get("description") as string) || null,
		value: (formData.get("value") as string) || "0",
		showInInfoReel: formData.get("showInInfoReel") === "on",
		purchasedAt: formData.get("purchasedAt")
			? new Date(formData.get("purchasedAt") as string)
			: null,
	};

	await db.updateInventoryItem(params.itemId, updateData);

	// Check for source context to create auto-link (skip if already exists from create-draft)
	const sourceType = formData.get("_sourceType") as string | null;
	const sourceId = formData.get("_sourceId") as string | null;
	if (sourceType && sourceId) {
		const exists = await db.entityRelationshipExists(
			sourceType as any,
			sourceId,
			"inventory",
			params.itemId,
		);
		if (!exists) {
			const user = await requirePermission(request, "inventory:write", getDatabase);
			await db.createEntityRelationship({
				relationAType: sourceType as any,
				relationId: sourceId,
				relationBType: "inventory",
				relationBId: params.itemId,
				createdBy: user?.userId || null,
			});
		}
	}

	// Handle returnUrl redirect (from source entity picker)
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect(`/inventory/${params.itemId}`);
}

export default function EditInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { item, sourceContext, returnUrl } = loaderData;
	const navigate = useNavigate();
	const { t } = useTranslation();

	const [name, setName] = useState(item.name);
	const [quantity, setQuantity] = useState(String(item.quantity));
	const [location, setLocation] = useState(item.location ?? "");
	const [category, setCategory] = useState(item.category || "");
	const [description, setDescription] = useState(item.description || "");
	const [value, setValue] = useState(item.value || "0");
	const [purchasedAt, setPurchasedAt] = useState(
		item.purchasedAt
			? new Date(item.purchasedAt).toISOString().split("T")[0]
			: "",
	);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("inventory.form.title_edit")} />

				<Form method="post" className="space-y-6">
					{/* Hidden fields for source context (auto-linking when created from picker) */}
					{sourceContext && (
						<>
							<input type="hidden" name="_sourceType" value={sourceContext.type} />
							<input type="hidden" name="_sourceId" value={sourceContext.id} />
						</>
					)}
					{returnUrl && <input type="hidden" name="_returnUrl" value={returnUrl} />}

					<TreasuryDetailCard
						title={t("inventory.details", "Item Details")}
					>
						<div className="grid gap-4">
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.name")} *`}
								name="name"
								type="text"
								value={name}
								onChange={setName}
								required
								placeholder={t("inventory.form.example", {
									example: "Kahvinkeitin",
								})}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.quantity")} *`}
								name="quantity"
								type="number"
								value={quantity}
								onChange={setQuantity}
								required
								min="1"
							/>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.location")} *`}
								name="location"
								type="text"
								value={location}
								onChange={setLocation}
								required
								placeholder={t("inventory.form.example", {
									example: "Kerhohuone",
								})}
							/>
							<TreasuryField
								mode="edit"
								label={t("common.fields.category")}
								name="category"
								type="text"
								value={category}
								onChange={setCategory}
								placeholder={t("inventory.form.example", {
									example: "Keittiö",
								})}
							/>
							<TreasuryField
								mode="edit"
								label={t("common.fields.description")}
								name="description"
								type="text"
								value={description}
								onChange={setDescription}
								placeholder={t(
									"inventory.form.description_placeholder",
								)}
							/>
							<TreasuryField
								mode="edit"
								label={t("common.fields.value")}
								name="value"
								type="number"
								value={value}
								onChange={setValue}
								min="0"
								step="0.01"
								placeholder={t(
									"inventory.form.value_placeholder",
								)}
							/>
							<TreasuryField
								mode="edit"
								label={t(
									"inventory.form.purchased_at_label",
								)}
								name="purchasedAt"
								type="date"
								value={purchasedAt}
								onChange={setPurchasedAt}
							/>
							<div className="flex items-center gap-3 pt-2">
								<Checkbox
									id="showInInfoReel"
									name="showInInfoReel"
									defaultChecked={item.showInInfoReel}
								/>
								<Label
									htmlFor="showInInfoReel"
									className="cursor-pointer"
								>
									{t("inventory.form.show_in_info_reel")}
								</Label>
							</div>
						</div>
					</TreasuryDetailCard>

					<TreasuryFormActions />
				</Form>
			</div>
		</PageWrapper>
	);
}
