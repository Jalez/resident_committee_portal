import type { Route } from "./+types/admin.purchases";
import { Form, useRouteLoaderData } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { getDatabase, type Purchase, type InventoryItem } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Kulukorvaukset / Purchases` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requireAdmin(request);
    const db = getDatabase();

    const purchases = await db.getPurchases();
    const inventoryItems = await db.getInventoryItems();

    // Create a map of inventory items for quick lookup
    const itemsMap = new Map(inventoryItems.map(item => [item.id, item]));

    // Enrich purchases with inventory item names
    const enrichedPurchases = purchases.map(purchase => ({
        ...purchase,
        inventoryItem: purchase.inventoryItemId ? itemsMap.get(purchase.inventoryItemId) : null,
    }));

    return {
        siteConfig: SITE_CONFIG,
        purchases: enrichedPurchases,
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requireAdmin(request);
    const db = getDatabase();

    const formData = await request.formData();
    const actionType = formData.get("_action");
    const purchaseId = formData.get("purchaseId") as string;

    if (actionType === "updateStatus" && purchaseId) {
        const newStatus = formData.get("status") as string;
        await db.updatePurchase(purchaseId, { status: newStatus as any });
    } else if (actionType === "delete" && purchaseId) {
        await db.deletePurchase(purchaseId);
    }

    return { success: true };
}

const statusLabels: Record<string, { fi: string; en: string; color: string }> = {
    pending: { fi: "Odottaa", en: "Pending", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300" },
    approved: { fi: "Hyväksytty", en: "Approved", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" },
    reimbursed: { fi: "Maksettu", en: "Reimbursed", color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300" },
    rejected: { fi: "Hylätty", en: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300" },
};

export default function AdminPurchases({ loaderData }: Route.ComponentProps) {
    const { purchases } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const isAdmin = rootData?.user?.role === "admin";

    if (!isAdmin) {
        return (
            <PageWrapper>
                <div className="p-8 text-center">
                    <p className="text-gray-500">Ei käyttöoikeutta / Access denied</p>
                </div>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper>
            <div className="w-full max-w-4xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Kulukorvaukset
                    </h1>
                    <p className="text-lg text-gray-500">Purchase Reimbursements</p>
                </div>

                {purchases.length === 0 ? (
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-8 text-center">
                        <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">receipt_long</span>
                        <p className="text-gray-600 dark:text-gray-400">
                            Ei kulukorvauksia / No purchase reimbursements yet
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {purchases.map((purchase) => {
                            const status = statusLabels[purchase.status] || statusLabels.pending;
                            return (
                                <div
                                    key={purchase.id}
                                    className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                                {purchase.inventoryItem?.name || "Tuntematon tavara"}
                                            </h3>
                                            <p className="text-2xl font-black text-primary">
                                                {purchase.inventoryItem?.value || "0"} €
                                            </p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${status.color}`}>
                                            {status.fi} / {status.en}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                                        <div>
                                            <span className="text-gray-500">Ostaja / Purchaser:</span>
                                            <p className="font-bold">{purchase.purchaserName}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Tilinumero / Bank Account:</span>
                                            <p className="font-mono">{purchase.bankAccount}</p>
                                        </div>
                                        {purchase.minutesId && (
                                            <div>
                                                <span className="text-gray-500">Pöytäkirja / Minutes:</span>
                                                <p>{purchase.minutesId}</p>
                                            </div>
                                        )}
                                        <div>
                                            <span className="text-gray-500">Luotu / Created:</span>
                                            <p>{new Date(purchase.createdAt).toLocaleDateString("fi-FI")}</p>
                                        </div>
                                    </div>

                                    {purchase.notes && (
                                        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                            <span className="text-sm text-gray-500">Lisätiedot / Notes:</span>
                                            <p className="text-sm">{purchase.notes}</p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        {purchase.status !== "approved" && (
                                            <Form method="post">
                                                <input type="hidden" name="_action" value="updateStatus" />
                                                <input type="hidden" name="purchaseId" value={purchase.id} />
                                                <input type="hidden" name="status" value="approved" />
                                                <Button type="submit" size="sm" variant="outline">
                                                    ✓ Hyväksy / Approve
                                                </Button>
                                            </Form>
                                        )}
                                        {purchase.status !== "reimbursed" && (
                                            <Form method="post">
                                                <input type="hidden" name="_action" value="updateStatus" />
                                                <input type="hidden" name="purchaseId" value={purchase.id} />
                                                <input type="hidden" name="status" value="reimbursed" />
                                                <Button type="submit" size="sm" variant="outline" className="text-green-600">
                                                    💰 Maksettu / Paid
                                                </Button>
                                            </Form>
                                        )}
                                        {purchase.status !== "rejected" && (
                                            <Form method="post">
                                                <input type="hidden" name="_action" value="updateStatus" />
                                                <input type="hidden" name="purchaseId" value={purchase.id} />
                                                <input type="hidden" name="status" value="rejected" />
                                                <Button type="submit" size="sm" variant="outline" className="text-red-600">
                                                    ✗ Hylkää / Reject
                                                </Button>
                                            </Form>
                                        )}
                                        <Form method="post" onSubmit={(e) => {
                                            if (!confirm("Haluatko varmasti poistaa? / Are you sure you want to delete?")) {
                                                e.preventDefault();
                                            }
                                        }}>
                                            <input type="hidden" name="_action" value="delete" />
                                            <input type="hidden" name="purchaseId" value={purchase.id} />
                                            <Button type="submit" size="sm" variant="destructive">
                                                🗑 Poista / Delete
                                            </Button>
                                        </Form>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </PageWrapper>
    );
}
