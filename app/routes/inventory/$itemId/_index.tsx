import { useTranslation } from "react-i18next";
import { useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const name = (data as any)?.inventory?.name || "Item";
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${name}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createViewLoader({
		entityType: "inventory",
		permission: "inventory:read",
		params: { ...params, inventoryId: params.itemId },
		request,
		fetchEntity: (db, id) => db.getInventoryItemById(id),
	});
}

export default function ViewInventoryItem({
	loaderData,
}: Route.ComponentProps) {
	const { inventory: item, relationships } = loaderData as any;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();

	const canWrite =
		rootData?.user?.permissions?.includes("inventory:write") ||
		rootData?.user?.permissions?.includes("*");

	const canDelete =
		rootData?.user?.permissions?.includes("inventory:delete") ||
		rootData?.user?.permissions?.includes("*");
	const displayFields = {
		name: { value: item.name, valueClassName: "font-semibold" },
		quantity: item.quantity,
		location: item.location || "—",
		category: { value: item.category, hide: !item.category },
		description: { value: item.description, hide: !item.description },
		status: item.status,
		purchasedAt: { value: item.purchasedAt, hide: !item.purchasedAt },
		showInInfoReel: item.showInInfoReel,
	};

	return (
		<PageWrapper>
			<ViewForm
				title={t("inventory.view.title", "View Item")}
				entityType="inventory"
				entityId={item.id}
				entityName={item.name || ""}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/inventory"
				canEdit={canWrite}
				canDelete={canDelete}
				translationNamespace="inventory.form"
			/>
		</PageWrapper>
	);
}
