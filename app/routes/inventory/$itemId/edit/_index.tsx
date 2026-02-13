import * as React from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigate } from "react-router";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
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
		params,
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

			const itemName = (item as any).name;
			const metaTitle = itemName ? `Muokkaa: ${itemName}` : "Muokkaa tavaraa";

			return {
				contextValues,
				sourceContext,
				metaTitle,
			};
		},
	});
}

const inventorySchema = z.object({
	name: z.string().min(1),
	quantity: z.preprocess((val) => Number(val), z.number().min(1)),
	location: z.string().min(1),
	category: z.string().optional(),
	description: z.string().optional(),
	value: z.string().optional(),
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
		params,
		request,
		schema: inventorySchema,
		fetchEntity: (db, id) => db.getInventoryItemById(id),
		onUpdate: ({ db, id, data, entity, formData }) =>
			db.updateInventoryItem(id, data),
		successRedirect: (item) => `/inventory`,
	});
}

export default function EditInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { inventory, contextValues, sourceContext, returnUrl, relationships } =
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
			value:
				isDraft &&
				(!item.value || item.value === "0") &&
				contextValues?.totalAmount
					? String(contextValues.totalAmount)
					: item.value || "0",
			purchasedAt:
				isDraft && !item.purchasedAt && contextValues?.date
					? new Date(contextValues.date).toISOString().split("T")[0]
					: item.purchasedAt
						? new Date(item.purchasedAt).toISOString().split("T")[0]
						: "",
			showInInfoReel: item.showInInfoReel,
		};

		return {
			name: initialValues.name,
			quantity: initialValues.quantity,
			location: initialValues.location,
			category: initialValues.category,
			description: initialValues.description,
			value: initialValues.value,
			purchasedAt: initialValues.purchasedAt,
			showInInfoReel: initialValues.showInInfoReel,
		};
	}, [item, contextValues, isDraft]);

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
