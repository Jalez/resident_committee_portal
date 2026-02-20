import * as React from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigate } from "react-router";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import { SmartCombobox } from "~/components/ui/smart-combobox";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.metaTitle || "Muokkaa tavaraa / Edit Item"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "inventory",
		permission: "inventory:write",
		params: { ...params, inventoryId: params.itemId },
		request,
		fetchEntity: (db, id) => db.getInventoryItemById(id),
		extend: async ({ db, entity: item }) => {
			const url = new URL(request.url);
			const sourceContext = getRelationshipContextFromUrl(url);
			const contextValues = await getRelationshipContext(
				db,
				"inventory",
				item.id,
			);
			const allItems = await db.getInventoryItems();

			const uniqueLocations = [...new Set(allItems.map((i: any) => i.location).filter(Boolean))] as string[];
			const uniqueCategories = [...new Set(allItems.map((i: any) => i.category).filter(Boolean))] as string[];
			const itemNames = [...new Set(allItems.map((i: any) => i.name).filter(Boolean))] as string[];

			const itemName = (item as any).name;
			const metaTitle = itemName ? `Muokkaa: ${itemName}` : "Muokkaa tavaraa";

			return {
				contextValues,
				sourceContext,
				metaTitle,
				uniqueLocations,
				uniqueCategories,
				itemNames,
			};
		},
	});
}

const inventorySchema = z.object({
	name: z.string().min(1),
	quantity: z.preprocess((val) => Number(val), z.number().min(1)),
	location: z.string().optional(),
	category: z.string().optional(),
	description: z.string().optional(),
	purchasedAt: z.string().optional(),
	showInInfoReel: z.preprocess(
		(val) => val === "true" || val === "on",
		z.boolean(),
	),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "inventory",
		permission: "inventory:write",
		params: { ...params, inventoryId: params.itemId },
		request,
		schema: inventorySchema,
		fetchEntity: (db, id) => db.getInventoryItemById(id),
		onUpdate: ({ db, id, data, entity, formData }) => {
			const sanitizedData = { ...data };
			if (sanitizedData.purchasedAt === "") {
				sanitizedData.purchasedAt = null;
			} else if (sanitizedData.purchasedAt) {
				sanitizedData.purchasedAt = new Date(sanitizedData.purchasedAt);
			}
			return db.updateInventoryItem(id, sanitizedData);
		},
		successRedirect: (item) => `/inventory`,
	});
}

export default function EditInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { inventory, contextValues, sourceContext, returnUrl, relationships, uniqueLocations, uniqueCategories, itemNames } =
		loaderData as any;
	const { t } = useTranslation();

	const isDraft = inventory.status === "draft";
	const item = inventory;

	const inputFields = React.useMemo(() => {
		const initialValues = {
			name:
				isDraft && !item.name && contextValues?.description
					? contextValues.description
					: item.name,
			quantity: item.quantity,
			location: item.location || "",
			category:
				isDraft && !item.category && contextValues?.category
					? contextValues.category
					: item.category || "",
			description: item.description || "",
			purchasedAt:
				isDraft && !item.purchasedAt && contextValues?.date
					? new Date(contextValues.date).toISOString().split("T")[0]
					: item.purchasedAt
						? new Date(item.purchasedAt).toISOString().split("T")[0]
						: "",
			showInInfoReel: item.showInInfoReel,
		};

		return {
			name: {
				value: initialValues.name,
				render: (field: any, value: string, onChange: (val: string) => void) => (
					<div className="space-y-1">
						<label htmlFor="name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t("inventory.form.name")}<span className="text-destructive ml-1">*</span></label>
						<SmartCombobox
							items={itemNames}
							value={value}
							onValueChange={onChange}
							placeholder={t("inventory.form.name_placeholder")}
							searchPlaceholder={t("inventory.form.name_placeholder")}
							emptyText={t("common.no_results")}
							customLabel={t("common.actions.use")}
							allowCustom={true}
						/>
						<input type="hidden" name="name" value={value || ""} />
					</div>
				),
			},
			quantity: initialValues.quantity,
			location: {
				value: initialValues.location,
				render: (field: any, value: string, onChange: (val: string) => void) => (
					<div className="space-y-1">
						<label htmlFor="location" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t("inventory.form.location")}</label>
						<SmartCombobox
							items={uniqueLocations}
							value={value}
							onValueChange={onChange}
							placeholder={t("inventory.form.location_placeholder")}
							searchPlaceholder={t("inventory.form.location_placeholder")}
							emptyText={t("common.no_results")}
							customLabel={t("common.actions.use")}
							allowCustom={true}
						/>
						<input type="hidden" name="location" value={value || ""} />
					</div>
				),
			},
			category: {
				value: initialValues.category,
				render: (field: any, value: string, onChange: (val: string) => void) => (
					<div className="space-y-1">
						<label htmlFor="category" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t("inventory.form.category")}</label>
						<SmartCombobox
							items={uniqueCategories}
							value={value}
							onValueChange={onChange}
							placeholder={t("inventory.form.category_placeholder")}
							searchPlaceholder={t("inventory.form.category_placeholder")}
							emptyText={t("common.no_results")}
							customLabel={t("common.actions.use")}
							allowCustom={true}
						/>
						<input type="hidden" name="category" value={value || ""} />
					</div>
				),
			},
			description: initialValues.description,
			purchasedAt: initialValues.purchasedAt,
			showInInfoReel: initialValues.showInInfoReel,
		};
	}, [item, contextValues, isDraft, uniqueCategories, uniqueLocations, itemNames, t]);

	return (
		<PageWrapper>
			<EditForm
				title={t("inventory.form.title_edit")}
				action=""
				inputFields={inputFields as any}
				entityType="inventory"
				entityId={item.id}
				returnUrl={returnUrl || "/inventory"}
				hiddenFields={{
					_sourceType: sourceContext?.type,
					_sourceId: sourceContext?.id,
					_returnUrl: returnUrl,
				}}
				translationNamespace="inventory.form"
				relationships={relationships}
			/>
		</PageWrapper>
	);
}
