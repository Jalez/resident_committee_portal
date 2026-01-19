import type { Route } from "./+types/treasury.reimbursements";
import { Form, Link, useRouteLoaderData, useSearchParams } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type Purchase } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Kulukorvaukset / Reimbursements` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "reimbursements:read", getDatabase);
    const db = getDatabase();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "all";
    const year = url.searchParams.get("year") || String(new Date().getFullYear());

    let purchases = await db.getPurchases();

    // Filter by year
    if (year !== "all") {
        purchases = purchases.filter(p => p.year === parseInt(year));
    }

    // Filter by status
    if (status !== "all") {
        purchases = purchases.filter(p => p.status === status);
    }

    // Sort by date descending
    purchases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Get inventory items for display
    const inventoryItems = await db.getInventoryItems();
    const itemsMap = new Map(inventoryItems.map(item => [item.id, item]));

    // Enrich purchases
    const enrichedPurchases = purchases.map(p => ({
        ...p,
        inventoryItem: p.inventoryItemId ? itemsMap.get(p.inventoryItemId) : null,
    }));

    // Get unique years from purchases
    const allPurchases = await db.getPurchases();
    const years = [...new Set(allPurchases.map(p => p.year))].sort((a, b) => b - a);

    // Calculate totals by status
    const totals = {
        pending: allPurchases.filter(p => p.status === "pending").reduce((sum, p) => sum + parseFloat(p.amount), 0),
        approved: allPurchases.filter(p => p.status === "approved").reduce((sum, p) => sum + parseFloat(p.amount), 0),
        reimbursed: allPurchases.filter(p => p.status === "reimbursed").reduce((sum, p) => sum + parseFloat(p.amount), 0),
    };

    return {
        siteConfig: SITE_CONFIG,
        purchases: enrichedPurchases,
        years,
        currentYear: parseInt(year) || new Date().getFullYear(),
        currentStatus: status,
        totals,
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requirePermission(request, "reimbursements:approve", getDatabase);
    const db = getDatabase();
    const formData = await request.formData();
    const actionType = formData.get("_action");
    const purchaseId = formData.get("purchaseId") as string;

    if (actionType === "updateStatus" && purchaseId) {
        const newStatus = formData.get("status") as string;
        await db.updatePurchase(purchaseId, { status: newStatus as any });

        // Also update the linked transaction's reimbursementStatus and status
        const linkedTransaction = await db.getTransactionByPurchaseId(purchaseId);
        if (linkedTransaction) {
            // Map purchase status to transaction reimbursementStatus and status
            let newReimbursementStatus: "requested" | "approved" | "declined" | "not_requested" = "requested";
            let newTransactionStatus: "pending" | "complete" | "paused" | "declined" = "pending";

            if (newStatus === "approved" || newStatus === "reimbursed") {
                newReimbursementStatus = "approved";
                newTransactionStatus = "complete";
            } else if (newStatus === "rejected") {
                newReimbursementStatus = "declined";
                newTransactionStatus = "declined";
            } else if (newStatus === "pending") {
                newReimbursementStatus = "requested";
                newTransactionStatus = "pending";
            }
            await db.updateTransaction(linkedTransaction.id, {
                reimbursementStatus: newReimbursementStatus,
                status: newTransactionStatus
            });
        }
    } else if (actionType === "cancel" && purchaseId) {
        await db.deletePurchase(purchaseId);
    }

    return { success: true };
}

const statusConfig = {
    pending: { fi: "Odottaa", en: "Pending", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    approved: { fi: "Hyväksytty", en: "Approved", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
    reimbursed: { fi: "Maksettu", en: "Paid", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    rejected: { fi: "Hylätty", en: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export default function BudgetReimbursements({ loaderData }: Route.ComponentProps) {
    const { purchases, years, currentYear, currentStatus, totals } = loaderData;
    const [searchParams, setSearchParams] = useSearchParams();
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const isStaff = rootData?.user?.roleName === "Admin" || rootData?.user?.roleName === "Board Member";

    const formatCurrency = (value: number | string) => {
        const num = typeof value === "string" ? parseFloat(value) : value;
        return num.toFixed(2).replace(".", ",") + " €";
    };

    const formatDate = (date: Date | string) => new Date(date).toLocaleDateString("fi-FI");

    const handleFilter = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value === "all") {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        setSearchParams(params);
    };

    if (!isStaff) {
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
            <div className="w-full max-w-5xl mx-auto px-4">
                {/* Header */}
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Link
                            to="/treasury"
                            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-2"
                        >
                            <span className="material-symbols-outlined text-base">arrow_back</span>
                            Takaisin / Back
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                            Kulukorvaukset
                        </h1>
                        <p className="text-lg text-gray-500">Reimbursements</p>
                    </div>
                    <Link to="/treasury/reimbursement/new">
                        <Button>
                            <span className="material-symbols-outlined mr-2">add</span>
                            Uusi / New
                        </Button>
                    </Link>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
                        <p className="text-xs font-bold uppercase text-yellow-700 dark:text-yellow-300">Odottaa / Pending</p>
                        <p className="text-xl font-black text-yellow-800 dark:text-yellow-200">{formatCurrency(totals.pending)}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300">Hyväksytty / Approved</p>
                        <p className="text-xl font-black text-blue-800 dark:text-blue-200">{formatCurrency(totals.approved)}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                        <p className="text-xs font-bold uppercase text-green-700 dark:text-green-300">Maksettu / Paid</p>
                        <p className="text-xl font-black text-green-800 dark:text-green-200">{formatCurrency(totals.reimbursed)}</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-4 mb-6">
                    <div className="flex gap-2">
                        <span className="text-sm text-gray-500 self-center">Status:</span>
                        {["all", "pending", "approved", "reimbursed", "rejected"].map(s => (
                            <button
                                key={s}
                                onClick={() => handleFilter("status", s)}
                                className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${currentStatus === s
                                    ? "bg-primary text-white"
                                    : "bg-gray-200 dark:bg-gray-700 hover:bg-primary/20"
                                    }`}
                            >
                                {s === "all" ? "Kaikki" : statusConfig[s as keyof typeof statusConfig]?.fi}
                            </button>
                        ))}
                    </div>
                    {years.length > 0 && (
                        <div className="flex gap-2">
                            <span className="text-sm text-gray-500 self-center">Vuosi:</span>
                            {years.map((y: number) => (
                                <button
                                    key={y}
                                    onClick={() => handleFilter("year", String(y))}
                                    className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${currentYear === y
                                        ? "bg-primary text-white"
                                        : "bg-gray-200 dark:bg-gray-700 hover:bg-primary/20"
                                        }`}
                                >
                                    {y}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {purchases.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            Ei kulukorvauksia / No reimbursements
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Päivä</TableHead>
                                    <TableHead>Kuvaus</TableHead>
                                    <TableHead>Ostaja</TableHead>
                                    <TableHead>Summa</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead title="Sähköposti lähetetty">📧</TableHead>
                                    <TableHead title="Vastaus vastaanotettu">💬</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchases.map((purchase: Purchase & { inventoryItem: any }) => {
                                    const statusInfo = statusConfig[purchase.status] || statusConfig.pending;
                                    const displayName = purchase.inventoryItem?.name || purchase.description || "—";
                                    const canApprove = rootData?.user?.permissions?.includes("reimbursements:approve") ||
                                        rootData?.user?.permissions?.includes("*");

                                    return (
                                        <TableRow key={purchase.id}>
                                            <TableCell className="font-mono text-sm">
                                                {formatDate(purchase.createdAt)}
                                            </TableCell>
                                            <TableCell className="font-medium max-w-[200px] truncate">
                                                {displayName}
                                            </TableCell>
                                            <TableCell>{purchase.purchaserName}</TableCell>
                                            <TableCell className="font-bold">{formatCurrency(purchase.amount)}</TableCell>
                                            <TableCell>
                                                {canApprove ? (
                                                    <Form method="post" className="inline-block">
                                                        <input type="hidden" name="_action" value="updateStatus" />
                                                        <input type="hidden" name="purchaseId" value={purchase.id} />
                                                        <select
                                                            name="status"
                                                            defaultValue={purchase.status}
                                                            onChange={(e) => e.target.form?.requestSubmit()}
                                                            className={`px-2 py-1 rounded text-xs font-bold cursor-pointer border-0 ${statusInfo.color}`}
                                                        >
                                                            <option value="pending">Odottaa / Pending</option>
                                                            <option value="approved">Hyväksytty / Approved</option>
                                                            <option value="reimbursed">Maksettu / Paid</option>
                                                            <option value="rejected">Hylätty / Rejected</option>
                                                        </select>
                                                    </Form>
                                                ) : (
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${statusInfo.color}`}>
                                                        {statusInfo.fi}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {purchase.emailSent ? (
                                                    <span className="text-green-600" title="Sähköposti lähetetty">✓</span>
                                                ) : purchase.emailError ? (
                                                    <span className="text-red-600" title={purchase.emailError}>✗</span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {/* Show reply indicator if email reply received */}
                                                {purchase.emailReplyReceived ? (
                                                    <span
                                                        className="text-blue-600 cursor-help"
                                                        title={purchase.emailReplyContent || "Vastaus vastaanotettu"}
                                                    >
                                                        💬
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>
        </PageWrapper>
    );
}
