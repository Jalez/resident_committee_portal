import { useTranslation } from "react-i18next";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { getDatabase, type InventoryItem } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";

type LoaderData = {
	siteConfig: typeof SITE_CONFIG;
	title: string;
	incompleteItems: InventoryItem[];
};

export function meta({ data }: { data?: LoaderData }) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.title || "Incomplete Items"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requirePermission(request, "inventory:read", getDatabase);
	const db = getDatabase();

	// Get all incomplete inventory items
	const incompleteItems = await db.getIncompleteInventoryItems();

	return {
		siteConfig: SITE_CONFIG,
		title: "Incomplete Inventory Items",
		incompleteItems,
	};
}

export default function IncompleteInventoryItems() {
	const { incompleteItems } = useLoaderData() as LoaderData;
	const { t } = useTranslation();

	return (
		<PageWrapper>
			<div className="w-full max-w-4xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-6">
					<PageHeader
						title={t("inventory.incomplete_items", "Items Needing Completion")}
					/>
					<Link to="/inventory">
						<Button variant="outline">
							<span className="material-symbols-outlined mr-2">arrow_back</span>
							{t("common.actions.back_to_list", "Back to Inventory")}
						</Button>
					</Link>
				</div>

				{incompleteItems.length === 0 ? (
					<div className="text-center py-12 text-muted-foreground">
						<span className="material-symbols-outlined text-6xl mb-4 block">
							check_circle
						</span>
						<p className="text-lg">
							{t(
								"inventory.no_incomplete_items",
								"All inventory items are complete!",
							)}
						</p>
					</div>
				) : (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground mb-4">
							{t(
								"inventory.incomplete_items_description",
								"These items were automatically created from receipt processing and need location information to be completed.",
							)}
						</p>

						<div className="grid gap-4">
							{incompleteItems.map((item) => (
								<div
									key={item.id}
									className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
								>
									<div className="flex items-start justify-between gap-4">
										<div className="flex-1 space-y-2">
											<div className="flex items-center gap-2">
												<span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400">
													warning
												</span>
												<h3 className="font-semibold text-lg">{item.name}</h3>
											</div>

											<div className="grid gap-2 text-sm">
												<div className="flex items-center gap-2">
													<span className="text-muted-foreground">
														{t("common.fields.quantity")}:
													</span>
													<span>
														{item.quantity} {t("inventory.unit", "pcs")}
													</span>
												</div>



												{item.completionNotes && (
													<div className="flex items-start gap-2">
														<span className="text-muted-foreground shrink-0">
															{t("common.fields.notes")}:
														</span>
														<span className="text-xs text-muted-foreground">
															{item.completionNotes}
														</span>
													</div>
												)}

												{item.purchasedAt && (
													<div className="flex items-center gap-2">
														<span className="text-muted-foreground">
															{t("common.fields.purchased_at")}:
														</span>
														<span>
															{new Date(item.purchasedAt).toLocaleDateString()}
														</span>
													</div>
												)}
											</div>

											<div className="flex items-center gap-2 text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded w-fit">
												<span className="material-symbols-outlined text-base">
													location_off
												</span>
												{t("inventory.location_missing", "Location needed")}
											</div>
										</div>

										<div className="flex flex-col gap-2 shrink-0">
											<Link to={`/inventory/${item.id}/edit`}>
												<Button variant="default" size="sm">
													<span className="material-symbols-outlined mr-1 text-base">
														edit_location
													</span>
													{t("inventory.complete_item", "Mark Complete")}
												</Button>
											</Link>
											<Link to={`/inventory/${item.id}`}>
												<Button variant="outline" size="sm">
													<span className="material-symbols-outlined mr-1 text-base">
														visibility
													</span>
													{t("common.actions.view", "View")}
												</Button>
											</Link>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</PageWrapper>
	);
}
