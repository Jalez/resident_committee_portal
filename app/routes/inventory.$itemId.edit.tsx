import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getDatabase, type NewInventoryItem } from "~/db";
import i18next from "~/i18next.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
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

	return {
		siteConfig: SITE_CONFIG,
		item,
		metaTitle: title,
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

	return redirect("/inventory");
}

export default function EditInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { item } = loaderData;
	const navigate = useNavigate();
	const { t } = useTranslation();

	const formatDateForInput = (date: Date | null) => {
		if (!date) return "";
		return new Date(date).toISOString().split("T")[0];
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("inventory.form.title_edit")}
					</h1>
					<p className="text-lg text-gray-500">
						{t("inventory.form.subtitle_edit")}
					</p>
				</div>

				<Form method="post" className="space-y-6">
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">{t("inventory.form.name_label")} *</Label>
								<Input
									id="name"
									name="name"
									required
									defaultValue={item.name}
									placeholder={t("inventory.form.example", {
										example: "Kahvinkeitin",
									})}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="quantity">
									{t("inventory.form.quantity_label")} *
								</Label>
								<Input
									id="quantity"
									name="quantity"
									type="number"
									min="1"
									required
									defaultValue={item.quantity}
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="location">
									{t("inventory.form.location_label")} *
								</Label>
								<Input
									id="location"
									name="location"
									required
									defaultValue={item.location}
									placeholder={t("inventory.form.example", {
										example: "Kerhohuone",
									})}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="category">
									{t("inventory.form.category_label")}
								</Label>
								<Input
									id="category"
									name="category"
									defaultValue={item.category || ""}
									placeholder={t("inventory.form.example", {
										example: "Keittiö",
									})}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">
								{t("inventory.form.description_label")}
							</Label>
							<Input
								id="description"
								name="description"
								defaultValue={item.description || ""}
								placeholder={t("inventory.form.description_placeholder")}
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="value">{t("inventory.form.value_label")}</Label>
								<Input
									id="value"
									name="value"
									type="number"
									step="0.01"
									min="0"
									defaultValue={item.value || "0"}
									placeholder={t("inventory.form.value_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="purchasedAt">
									{t("inventory.form.purchased_at_label")}
								</Label>
								<Input
									id="purchasedAt"
									name="purchasedAt"
									type="date"
									defaultValue={formatDateForInput(item.purchasedAt)}
								/>
							</div>
						</div>

						<div className="flex items-center gap-3 pt-2">
							<Checkbox
								id="showInInfoReel"
								name="showInInfoReel"
								defaultChecked={item.showInInfoReel}
							/>
							<Label htmlFor="showInInfoReel" className="cursor-pointer">
								{t("inventory.form.show_in_info_reel")}
							</Label>
						</div>
					</div>

					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(-1)}
							className="flex-1"
						>
							{t("inventory.form.cancel")}
						</Button>
						<Button type="submit" className="flex-1">
							{t("inventory.form.save")}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
