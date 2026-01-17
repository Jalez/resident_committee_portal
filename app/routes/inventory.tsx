import type { Route } from "./+types/inventory";
import { useFetcher, useNavigation } from "react-router";
import { useState } from "react";
import { PageWrapper, SplitLayout, QRPanel, ContentArea } from "~/components/layout/page-layout";
import { getDatabase, type InventoryItem, type NewInventoryItem } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { useUser } from "~/contexts/user-context";
import { getAuthenticatedUser, getGuestPermissions } from "~/lib/auth.server";
import { DataTable } from "~/components/ui/data-table";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import {
    PAGE_SIZE,
    InventoryProvider,
    useInventory,
    useInventoryColumns,
    InventoryFilters,
    InventoryAddRow,
    InventoryInfoReelCards,
} from "~/components/inventory";

// ============================================================================
// Meta
// ============================================================================

export function meta({ data }: Route.MetaArgs) {
    const filters = [];
    if (data?.filters?.name) filters.push(data.filters.name);
    if (data?.filters?.location) filters.push(data.filters.location);
    if (data?.filters?.category) filters.push(data.filters.category);

    const filterText = filters.length > 0 ? ` - ${filters.join(", ")}` : "";

    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Tavaraluettelo${filterText} / Inventory` },
        { name: "description", content: "Toimikunnan tavaraluettelo / Tenant Committee Inventory" },
    ];
}

// ============================================================================
// Loader
// ============================================================================

export async function loader({ request }: Route.LoaderArgs) {
    // Check permission (works for both logged-in users and guests)
    const authUser = await getAuthenticatedUser(request, getDatabase);
    const permissions = authUser
        ? authUser.permissions
        : await getGuestPermissions(() => getDatabase());

    const canRead = permissions.some(p => p === "inventory:read" || p === "*");
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

    const db = getDatabase();
    const url = new URL(request.url);
    const nameFilter = url.searchParams.get("name") || "";
    const locationFilter = url.searchParams.get("location") || "";
    const categoryFilter = url.searchParams.get("category") || "";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const isInfoReel = url.searchParams.get("view") === "infoReel";

    const allItems = await db.getInventoryItems();
    const uniqueLocations = [...new Set(allItems.map(item => item.location).filter(Boolean))].sort();
    const uniqueCategories = [...new Set(allItems.map(item => item.category).filter(Boolean) as string[])].sort();

    if (isInfoReel) {
        const reelItems = allItems.filter(item => item.showInInfoReel);
        const shuffled = reelItems.sort(() => Math.random() - 0.5);
        const items = shuffled.slice(0, 3);

        return {
            siteConfig: SITE_CONFIG,
            items,
            filters: { name: nameFilter, location: locationFilter, category: categoryFilter },
            isInfoReel: true,
            totalCount: items.length,
            currentPage: 1,
            pageSize: PAGE_SIZE,
            uniqueLocations,
            uniqueCategories,
        };
    }

    let items = [...allItems];
    if (nameFilter) {
        const searchTerm = nameFilter.toLowerCase();
        items = items.filter(item => item.name.toLowerCase().includes(searchTerm));
    }
    if (locationFilter) {
        const searchTerm = locationFilter.toLowerCase();
        items = items.filter(item => item.location.toLowerCase() === searchTerm);
    }
    if (categoryFilter) {
        const searchTerm = categoryFilter.toLowerCase();
        items = items.filter(item => (item.category || "").toLowerCase() === searchTerm);
    }

    items = items.sort((a, b) => a.name.localeCompare(b.name, "fi"));
    const totalCount = items.length;
    const startIndex = (page - 1) * PAGE_SIZE;
    const paginatedItems = items.slice(startIndex, startIndex + PAGE_SIZE);

    return {
        siteConfig: SITE_CONFIG,
        items: paginatedItems,
        filters: { name: nameFilter, location: locationFilter, category: categoryFilter },
        isInfoReel: false,
        totalCount,
        currentPage: page,
        pageSize: PAGE_SIZE,
        uniqueLocations,
        uniqueCategories,
    };
}

// ============================================================================
// Action
// ============================================================================

export async function action({ request }: Route.ActionArgs) {
    const db = getDatabase();
    const formData = await request.formData();
    const actionType = formData.get("_action");
    const itemId = formData.get("itemId") as string;
    const itemIds = formData.get("itemIds") as string;

    if (actionType === "delete" && itemId) {
        const purchases = await db.getPurchasesByInventoryItem(itemId);
        for (const purchase of purchases) {
            await db.deletePurchase(purchase.id);
        }
        await db.deleteInventoryItem(itemId);
    }

    if (actionType === "deleteMany" && itemIds) {
        const ids = JSON.parse(itemIds) as string[];
        for (const id of ids) {
            const purchases = await db.getPurchasesByInventoryItem(id);
            for (const purchase of purchases) {
                await db.deletePurchase(purchase.id);
            }
            await db.deleteInventoryItem(id);
        }
    }

    if (actionType === "toggleInfoReel" && itemId) {
        const item = await db.getInventoryItemById(itemId);
        if (item) {
            await db.updateInventoryItem(itemId, { showInInfoReel: !item.showInInfoReel });
        }
    }

    if (actionType === "updateField" && itemId) {
        const field = formData.get("field") as string;
        const value = formData.get("value") as string;
        if (field && ["name", "category", "description", "location", "quantity", "value"].includes(field)) {
            if (field === "quantity") {
                await db.updateInventoryItem(itemId, { quantity: parseInt(value) || 1 });
            } else if (field === "value") {
                await db.updateInventoryItem(itemId, { value: value || "0" });
            } else {
                await db.updateInventoryItem(itemId, { [field]: value || null });
            }
        }
    }

    if (actionType === "createItem") {
        const newItem: NewInventoryItem = {
            name: formData.get("name") as string,
            quantity: parseInt(formData.get("quantity") as string) || 1,
            location: formData.get("location") as string,
            category: (formData.get("category") as string) || null,
            description: (formData.get("description") as string) || null,
            value: formData.get("value") as string || "0",
        };
        await db.createInventoryItem(newItem);
    }

    if (actionType === "report") {
        const reportItemIds = formData.get("reportItemIds") as string;
        const reportMessage = formData.get("reportMessage") as string;
        const ids = JSON.parse(reportItemIds) as string[];

        const itemNames: string[] = [];
        for (const id of ids) {
            const item = await db.getInventoryItemById(id);
            if (item) itemNames.push(item.name);
        }

        await db.createSubmission({
            type: "questions",
            name: "Tavaraluettelo / Inventory Report",
            email: "inventory@report",
            message: `Ilmoitus tavaroista / Report for items:\n${itemNames.join(", ")}\n\nViesti / Message:\n${reportMessage}`,
        });
    }

    return { success: true };
}

// ============================================================================
// Component
// ============================================================================

export default function Inventory({ loaderData }: Route.ComponentProps) {
    const { items, filters, isInfoReel, totalCount, currentPage, pageSize, uniqueLocations, uniqueCategories } = loaderData;
    const { hasPermission } = useUser();
    const canWrite = hasPermission("inventory:write");
    const canDelete = hasPermission("inventory:delete");

    return (
        <InventoryProvider
            items={items}
            filters={filters}
            uniqueLocations={uniqueLocations}
            uniqueCategories={uniqueCategories}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
            isStaff={canWrite}
            isAdmin={canDelete}
        >
            {isInfoReel ? <InventoryInfoReelPage /> : <InventoryTablePage />}
        </InventoryProvider>
    );
}

// ============================================================================
// Info Reel Page
// ============================================================================

function InventoryInfoReelPage() {
    const { items, isStaff, showAddRow, setShowAddRow } = useInventory();

    return (
        <PageWrapper>
            <SplitLayout right={<InventoryQRPanel />} footer={<InventoryFooter />} header={{ finnish: "Tavaraluettelo", english: "Inventory" }}>
                <ContentArea>
                    <InventoryInfoReelCards items={items} />
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}

// ============================================================================
// Table Page
// ============================================================================

function InventoryTablePage() {
    const {
        items,
        totalCount,
        currentPage,
        pageSize,
        isStaff,
        showAddRow,
        selectedIds,
        setSelectedIds,
        visibleColumns,
        handleInlineEdit,
        handlePageChange,
        handleDeleteSelected,
        handleAddTreasuryTransaction,
        uniqueLocations,
        uniqueCategories,
    } = useInventory();

    const navigation = useNavigation();
    const fetcher = useFetcher();
    const isLoading = navigation.state === "loading";

    // Report modal state
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportMessage, setReportMessage] = useState("");

    const handleSubmitReport = () => {
        if (selectedIds.length === 0 || !reportMessage.trim()) return;
        fetcher.submit(
            {
                _action: "report",
                reportItemIds: JSON.stringify(selectedIds),
                reportMessage: reportMessage,
            },
            { method: "POST" }
        );
        setShowReportModal(false);
        setReportMessage("");
        setSelectedIds([]);
    };

    const columns = useInventoryColumns({
        visibleColumns,
        isStaff,
        onInlineEdit: handleInlineEdit,
        uniqueLocations,
        uniqueCategories,
        itemNames: items.map(i => i.name),
    });

    const addRowElement = isStaff && showAddRow ? <InventoryAddRow /> : null;

    // Get selected item names for display
    const selectedItemNames = items
        .filter(i => selectedIds.includes(i.id))
        .map(i => i.name);

    const actionsComponent = (
        <div className="flex gap-2">
            {/* Report button - available to all users */}
            <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReportModal(true)}
                disabled={selectedIds.length === 0}
            >
                <span className="material-symbols-outlined text-base mr-1">report</span>
                Ilmoita / Report
            </Button>
            {isStaff && (
                <Button
                    variant="default"
                    size="sm"
                    onClick={handleAddTreasuryTransaction}
                    disabled={selectedIds.length === 0}
                >
                    <span className="material-symbols-outlined text-base mr-1">account_balance</span>
                    Lisää rahastotapahtuma
                </Button>
            )}
        </div>
    );

    return (
        <PageWrapper>
            <SplitLayout footer={<InventoryFooter />} header={{ finnish: "Tavaraluettelo", english: "Inventory" }}>
                <div className={`space-y-4 transition-opacity duration-200 ${isLoading ? "opacity-50" : ""}`}>
                    <InventoryFilters />

                    <DataTable
                        columns={columns}
                        data={items}
                        getRowId={(row) => row.id}
                        totalCount={totalCount}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={handlePageChange}
                        enableRowSelection={true}
                        onDeleteSelected={isStaff ? handleDeleteSelected : undefined}
                        onSelectionChange={setSelectedIds}
                        prependedRow={addRowElement}
                        actionsComponent={selectedIds.length > 0 ? actionsComponent : undefined}
                    />
                </div>
            </SplitLayout>

            {/* Report Modal */}
            <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ilmoita ongelmasta / Report an issue</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-500 mb-2">Valitut tavarat / Selected items:</p>
                            <p className="font-medium">{selectedItemNames.join(", ")}</p>
                        </div>
                        <Textarea
                            value={reportMessage}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReportMessage(e.target.value)}
                            placeholder="Kuvaa ongelma... / Describe the issue..."
                            rows={4}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReportModal(false)}>
                            Peruuta / Cancel
                        </Button>
                        <Button onClick={handleSubmitReport} disabled={!reportMessage.trim()}>
                            Lähetä / Send
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    );
}

// ============================================================================
// Shared Components
// ============================================================================

function InventoryQRPanel() {
    return (
        <QRPanel
            qrUrl="/inventory"
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    Tavaraluettelo <br />
                    <span className="text-lg text-gray-400 font-bold">Inventory</span>
                </h2>
            }
        />
    );
}

function InventoryFooter() {
    const { isAdmin, isStaff, showAddRow, setShowAddRow } = useInventory();

    return (
        <div className="flex items-center gap-2">
            {isAdmin && (
                <>
                    <a href="/api/inventory/export" className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Export CSV">
                        <span className="material-symbols-outlined text-xl">download</span>
                    </a>
                    <label className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer" title="Import">
                        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append("file", file);
                            const res = await fetch("/api/inventory/import", { method: "POST", body: formData });
                            const data = await res.json();
                            alert(data.success ? `Imported ${data.imported} items` : `Error: ${data.error}`);
                            if (data.success) window.location.reload();
                            e.target.value = "";
                        }} />
                        <span className="material-symbols-outlined text-xl">upload</span>
                    </label>
                </>
            )}
            {isStaff && (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowAddRow(!showAddRow)}
                    className="flex items-center gap-1"
                >
                    <span className="material-symbols-outlined text-base">{showAddRow ? "close" : "add"}</span>
                    {showAddRow ? "Sulje" : "Lisää"}
                </Button>
            )}
        </div>
    );
}
