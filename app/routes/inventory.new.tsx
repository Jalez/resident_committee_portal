import { useEffect, useState } from "react";
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
import {
	type ComboboxItem,
	SmartCombobox,
} from "~/components/ui/smart-combobox";
import {
	type NewInventoryItem as DbNewInventoryItem,
	getDatabase,
} from "~/db";
import i18next from "~/i18next.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/inventory.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.metaTitle || "Uusi tavara / New Item"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();
	const t = await i18next.getFixedT(request, "common");
	const metaTitle = t("inventory.form.title_new");

	const existingItems = await db.getInventoryItems();
	const uniqueItems = existingItems.map((item) => ({
		id: item.id,
		name: item.name,
		location: item.location,
		category: item.category,
		description: item.description,
		value: item.value,
	}));

	return {
		siteConfig: SITE_CONFIG,
		existingItems: uniqueItems,
		metaTitle,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();

	const formData = await request.formData();

	// Smart add: check if an existing item matches
	const existingItemId = formData.get("existingItemId") as string | null;

	if (existingItemId) {
		const existingItem = await db.getInventoryItemById(existingItemId);
		if (existingItem) {
			const addQty =
				parseInt(formData.get("quantity") as string, 10) || 1;
			await db.updateInventoryItem(existingItemId, {
				quantity: existingItem.quantity + addQty,
			});
			return redirect(`/inventory/${existingItemId}`);
		}
	}

	// Create new inventory item
	const newItem: DbNewInventoryItem = {
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

	const inventoryItem = await db.createInventoryItem(newItem);

	return redirect(`/inventory/${inventoryItem.id}`);
}

export default function NewInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { existingItems } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();

	// Extract unique options for SmartCombobox
	const uniqueLocations = Array.from(
		new Set(existingItems.map((i) => i.location)),
	)
		.filter((l): l is string => !!l)
		.sort();
	const uniqueCategories = Array.from(
		new Set(existingItems.map((i) => i.category)),
	)
		.filter((c): c is string => !!c)
		.sort();

	const [itemName, setItemName] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [location, setLocation] = useState("");
	const [category, setCategory] = useState("");
	const [description, setDescription] = useState("");
	const [itemValue, setItemValue] = useState("0");
	const [purchasedAt, setPurchasedAt] = useState(
		new Date().toISOString().split("T")[0],
	);
	const [selectedExistingId, setSelectedExistingId] = useState<
		string | null
	>(null);

	// Auto-fill when name matches an existing item
	useEffect(() => {
		const match = existingItems.find(
			(i) => i.name.toLowerCase() === itemName.toLowerCase(),
		);
		if (match) {
			setSelectedExistingId(match.id);
			if (!location || location === match.location)
				setLocation(match.location ?? "");
			if (
				!category ||
				category === match.category ||
				!match.category
			)
				setCategory(match.category || "");
			if (
				!description ||
				description === match.description ||
				!match.description
			)
				setDescription(match.description || "");
			if (
				(!itemValue || itemValue === "0") &&
				match.value &&
				match.value !== "0"
			) {
				setItemValue(match.value);
			}
		} else {
			setSelectedExistingId(null);
		}
	}, [itemName, existingItems, category, description, itemValue, location]);

	const isExactMatch = () => {
		if (!selectedExistingId) return false;
		const match = existingItems.find(
			(i) => i.id === selectedExistingId,
		);
		if (!match) return false;

		return (
			match.location === location &&
			(match.category || "") === category &&
			(match.description || "") === description &&
			(match.value || "0") === itemValue
		);
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("inventory.form.title_new")} />

				<Form method="post" className="space-y-6">
					<input type="hidden" name="name" value={itemName} />
					<input type="hidden" name="location" value={location} />
					<input type="hidden" name="category" value={category} />
					<input
						type="hidden"
						name="existingItemId"
						value={
							isExactMatch() && selectedExistingId
								? selectedExistingId
								: ""
						}
					/>

					<TreasuryDetailCard
						title={t("inventory.form.details_header")}
					>
						<div className="grid gap-4">
							<div className="space-y-1">
								<Label>
									{t("common.fields.name")} *
								</Label>
								<SmartCombobox
									items={existingItems.map((i) => ({
										...i,
										value: i.name,
										label: i.name,
										itemValue: i.value,
									}))}
									value={itemName}
									onValueChange={setItemName}
									placeholder={t(
										"inventory.form.name_placeholder",
									)}
									searchPlaceholder={t(
										"inventory.form.name_search_placeholder",
									)}
									emptyText={t(
										"inventory.form.name_empty",
									)}
									customLabel={t(
										"inventory.add_row.new_text",
									)}
									renderItem={(item) => {
										const comboboxItem =
											item as ComboboxItem & {
												location?: string;
											};
										return (
											<>
												{comboboxItem.label}
												{comboboxItem.location && (
													<span className="ml-2 text-xs text-muted-foreground">
														(
														{
															comboboxItem.location
														}
														)
													</span>
												)}
											</>
										);
									}}
									onSelect={(item) => {
										const comboboxItem =
											item as ComboboxItem & {
												id: string;
												location: string;
												category?: string;
												description?: string;
												itemValue?: string;
											};
										setSelectedExistingId(
											comboboxItem.id,
										);
										setLocation(comboboxItem.location);
										setCategory(
											comboboxItem.category || "",
										);
										setDescription(
											comboboxItem.description || "",
										);
										if (
											comboboxItem.itemValue &&
											comboboxItem.itemValue !== "0"
										)
											setItemValue(
												comboboxItem.itemValue,
											);
									}}
								/>
							</div>
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
							<div className="space-y-1">
								<Label>
									{t("common.fields.location")} *
								</Label>
								<SmartCombobox
									items={uniqueLocations}
									value={location}
									onValueChange={setLocation}
									placeholder={t(
										"inventory.form.location_placeholder",
									)}
									searchPlaceholder={t(
										"inventory.form.location_search_placeholder",
									)}
									emptyText={t(
										"inventory.form.location_empty",
									)}
								/>
							</div>
							<div className="space-y-1">
								<Label>
									{t("common.fields.category")}
								</Label>
								<SmartCombobox
									items={uniqueCategories}
									value={category}
									onValueChange={setCategory}
									placeholder={t(
										"inventory.form.category_placeholder",
									)}
									searchPlaceholder={t(
										"inventory.form.category_search_placeholder",
									)}
									emptyText={t(
										"inventory.form.location_empty",
									)}
								/>
							</div>
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
								value={itemValue}
								onChange={setItemValue}
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

					<TreasuryFormActions
						saveLabel={t("common.actions.add")}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
