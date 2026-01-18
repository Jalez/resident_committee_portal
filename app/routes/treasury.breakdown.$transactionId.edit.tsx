import type { Route } from "./+types/treasury.breakdown.$transactionId.edit";
import { Form, redirect, useNavigate, useFetcher, useActionData, useSearchParams } from "react-router";
import { useState, useEffect, useRef } from "react";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type Transaction, type TransactionStatus, type ReimbursementStatus, type InventoryItem } from "~/db";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "~/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { toast } from "sonner";
import { TransactionItemList } from "~/components/treasury/transaction-item-list";

export function meta({ data }: Route.MetaArgs) {
    const description = data?.transaction?.description;
    const title = description
        ? `Muokkaa: ${description.substring(0, 30)} / Edit Transaction`
        : "Muokkaa tapahtumaa / Edit Transaction";
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    await requirePermission(request, "treasury:edit", getDatabase);
    const db = getDatabase();

    const transactions = await db.getAllTransactions();
    const transaction = transactions.find(t => t.id === params.transactionId);

    if (!transaction) {
        throw new Response("Not Found", { status: 404 });
    }

    // Get linked purchase if exists
    let purchase = null;
    if (transaction.purchaseId) {
        purchase = await db.getPurchaseById(transaction.purchaseId);
    }

    // Get currently linked inventory items
    const linkedItems = await db.getInventoryItemsForTransaction(params.transactionId);

    // Get available items for picker (active, non-legacy, with available quantity)
    const pickerItems = await db.getInventoryItemsForPicker();

    // Get unique locations and categories for picker filters
    const allInventoryItems = await db.getInventoryItems();
    const uniqueLocations = [...new Set(allInventoryItems.map(item => item.location).filter(Boolean))].sort();
    const uniqueCategories = [...new Set(allInventoryItems.map(item => item.category).filter(Boolean) as string[])].sort();

    return {
        siteConfig: SITE_CONFIG,
        transaction,
        purchase,
        linkedItems,
        pickerItems,
        uniqueLocations,
        uniqueCategories,
    };
}

export async function action({ request, params }: Route.ActionArgs) {
    await requirePermission(request, "treasury:edit", getDatabase);
    const db = getDatabase();

    const formData = await request.formData();
    const actionType = formData.get("_action") as string;

    // Get transaction to preserve year for redirect
    const transactions = await db.getAllTransactions();
    const transaction = transactions.find(t => t.id === params.transactionId);
    const year = transaction?.year || new Date().getFullYear();

    // Handle delete action
    if (actionType === "delete") {
        if (!transaction) {
            return { error: "Transaction not found" };
        }

        // Check for linked active inventory items
        const activeItems = await db.getActiveInventoryItemsForTransaction(params.transactionId);
        if (activeItems.length > 0) {
            const itemNames = activeItems.map(item => item.name).join(", ");
            return {
                error: `Tapahtumaa ei voi poistaa koska siihen on linkitetty aktiivisia tavaroita: ${itemNames}. Poista tai merkitse tavarat Legacy-tilaan ensin.`,
                errorEn: `Cannot delete transaction because it has linked active inventory items: ${itemNames}. Remove or mark items as Legacy first.`,
                linkedItems: activeItems,
            };
        }

        // Delete the transaction (junction table entries should cascade or be handled)
        await db.deleteTransaction(params.transactionId);
        return redirect(`/treasury/breakdown?year=${year}&success=Transaction deleted`);
    }

    // Handle linking items
    if (actionType === "linkItems") {
        const itemIdsJson = formData.get("itemIds") as string;
        const quantitiesJson = formData.get("quantities") as string;

        console.log("[LinkItems] itemIdsJson:", itemIdsJson);
        console.log("[LinkItems] quantitiesJson:", quantitiesJson);

        if (itemIdsJson) {
            const itemIds = JSON.parse(itemIdsJson) as string[];
            const quantities = quantitiesJson ? JSON.parse(quantitiesJson) as Record<string, number> : {};

            console.log("[LinkItems] Parsed quantities:", quantities);

            for (const itemId of itemIds) {
                const item = await db.getInventoryItemById(itemId);
                if (item) {
                    // Use provided quantity, or default to item's full quantity
                    const quantity = quantities[itemId] || item.quantity;
                    console.log(`[LinkItems] Linking ${itemId} with quantity ${quantity} (provided: ${quantities[itemId]}, item.quantity: ${item.quantity})`);
                    await db.linkInventoryItemToTransaction(itemId, params.transactionId, quantity);
                }
            }
        }
        return { success: true, message: "Items linked successfully" };
    }

    // Handle unlinking a single item
    if (actionType === "unlinkItem") {
        const itemId = formData.get("itemId") as string;
        if (itemId) {
            await db.unlinkInventoryItemFromTransaction(itemId, params.transactionId);
        }
        return { success: true, message: "Item unlinked successfully" };
    }

    // Handle update action (default)
    const status = formData.get("status") as TransactionStatus;
    const reimbursementStatus = formData.get("reimbursementStatus") as ReimbursementStatus;
    const description = formData.get("description") as string;
    const category = (formData.get("category") as string) || null;
    const amountStr = formData.get("amount") as string;
    const amount = amountStr ? amountStr.replace(",", ".") : transaction?.amount.toString();

    await db.updateTransaction(params.transactionId, {
        status,
        reimbursementStatus,
        description,
        category,
        amount: amount || "0",
    });

    // If transaction has a linked purchase, update its status too
    if (transaction?.purchaseId) {
        const purchaseStatus = reimbursementStatus === "approved" ? "approved"
            : reimbursementStatus === "declined" ? "rejected"
                : "pending";
        await db.updatePurchase(transaction.purchaseId, { status: purchaseStatus });
    }

    return redirect(`/treasury/breakdown?year=${year}`);
}

export default function EditTransaction({ loaderData }: Route.ComponentProps) {
    const {
        transaction,
        purchase,
        linkedItems,
        pickerItems,
        uniqueLocations,
        uniqueCategories
    } = loaderData as {
        transaction: Transaction;
        purchase: any;
        linkedItems: (InventoryItem & { quantity: number })[];
        pickerItems: (InventoryItem & { availableQuantity: number })[];
        uniqueLocations: string[];
        uniqueCategories: string[];
    };
    const navigate = useNavigate();
    const fetcher = useFetcher();
    const actionData = useActionData<typeof action>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { items: contextItems, isHydrated, clearItems } = useNewTransaction();

    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // Track pending items to add (from context)
    const [pendingItems, setPendingItems] = useState<{ itemId: string; name: string; quantity: number; unitValue: number }[]>([]);

    // Track editable transaction amount
    const [transactionAmount, setTransactionAmount] = useState(transaction.amount);

    // Track if we've already processed the addItems param
    const hasProcessedAddItems = useRef(false);

    // Load pending items from context when ?addItems=true
    useEffect(() => {
        const addItems = searchParams.get("addItems");

        // Wait for context to hydrate from sessionStorage
        if (!isHydrated) return;

        if (addItems === "true" && contextItems.length > 0 && !hasProcessedAddItems.current) {
            hasProcessedAddItems.current = true;

            console.log("[AddToExisting] Loading items from context:", contextItems);

            // Add context items to pending list
            setPendingItems(contextItems);

            // Clear context and remove query param
            clearItems();
            setSearchParams(prev => {
                prev.delete("addItems");
                return prev;
            });
        }
    }, [searchParams, contextItems, isHydrated, clearItems, setSearchParams]);

    // Enforce minimum amount based on linked and pending items
    // If the sum of item values exceeds the current amount, update the amount.
    useEffect(() => {
        const linkedTotal = linkedItems.reduce((sum, item) => sum + ((parseFloat(item.value || "0")) * item.quantity), 0);
        const pendingTotal = pendingItems.reduce((sum, item) => sum + (item.unitValue * item.quantity), 0);
        const totalValue = linkedTotal + pendingTotal;

        setTransactionAmount(prev => {
            const current = parseFloat(prev) || 0;
            // If calculation suggests a higher amount than currently set, bump it up.
            if (totalValue > current) {
                return totalValue.toFixed(2);
            }
            return prev;
        });
    }, [linkedItems, pendingItems]);

    // Handle linking pending items
    const handleLinkPendingItems = () => {
        for (const item of pendingItems) {
            fetcher.submit(
                {
                    _action: "linkItems",
                    itemIds: JSON.stringify([item.itemId]),
                    quantities: JSON.stringify({ [item.itemId]: item.quantity }),
                },
                { method: "POST" }
            );
        }
        setPendingItems([]);
        toast.success("Tavarat linkitetty / Items linked");
    };


    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString("fi-FI");
    };

    const formatCurrency = (value: string | number) => {
        const num = typeof value === "string" ? parseFloat(value) : value;
        return num.toFixed(2).replace(".", ",") + " €";
    };

    const handleDelete = () => {
        fetcher.submit(
            { _action: "delete" },
            { method: "POST" }
        );
        setShowDeleteDialog(false);
    };


    const handleUnlinkItem = (itemId: string) => {
        fetcher.submit(
            {
                _action: "unlinkItem",
                itemId
            },
            { method: "POST" }
        );
    };

    // Filter out already linked items from picker
    const linkedItemIds = new Set(linkedItems.map(i => i.id));
    const availableForLinking = pickerItems.filter(i => !linkedItemIds.has(i.id));

    // Show toast on success
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data && 'success' in fetcher.data) {
            toast.success(fetcher.data.message || "Action completed");
        }
    }, [fetcher.state, fetcher.data]);

    // Check for error from action (delete validation failure)
    const deleteError = actionData && 'error' in actionData ? actionData.error : null;

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Muokkaa tapahtumaa
                    </h1>
                    <p className="text-lg text-gray-500">Edit Transaction</p>
                </div>

                {/* Error display */}
                {deleteError && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                        <div className="flex items-start gap-3">
                            <span className="material-symbols-outlined text-red-600 dark:text-red-400">error</span>
                            <div>
                                <p className="font-medium text-red-800 dark:text-red-300">
                                    Poistaminen estetty / Deletion blocked
                                </p>
                                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                                    {deleteError}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <Form method="post" className="space-y-6">
                    {/* Transaction Info (read-only summary) */}
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm text-gray-500">Päivämäärä / Date</p>
                                <p className="font-mono">{formatDate(transaction.date)}</p>
                            </div>
                            <div className="text-right">
                                <Label htmlFor="amount" className="text-sm text-gray-500 block mb-1">Summa / Amount</Label>
                                <div className="flex items-center justify-end gap-1">
                                    <span className={`font-bold text-lg ${transaction.type === "expense" ? "text-red-600" : "text-green-600"}`}>
                                        {transaction.type === "expense" ? "-" : "+"}
                                    </span>
                                    <Input
                                        id="amount"
                                        name="amount"
                                        value={transactionAmount}
                                        onChange={(e) => setTransactionAmount(e.target.value)}
                                        className="w-32 text-right font-bold text-lg h-9"
                                    />
                                    <span className="text-gray-500 font-bold">€</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Vuosi / Year</p>
                            <p>{transaction.year}</p>
                        </div>
                    </div>

                    {/* Editable Fields */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Muokattavat tiedot / Editable Fields
                        </h2>

                        <div className="space-y-2">
                            <Label htmlFor="description">Kuvaus / Description *</Label>
                            <Input
                                id="description"
                                name="description"
                                required
                                defaultValue={transaction.description}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="category">Kategoria / Category</Label>
                            <Input
                                id="category"
                                name="category"
                                defaultValue={transaction.category || ""}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="status">Tila / Status *</Label>
                                <Select name="status" defaultValue={transaction.status} required>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="complete">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                Valmis / Complete
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="pending">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                                Odottaa / Pending
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="paused">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                                                Pysäytetty / Paused
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="declined">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                Hylätty / Declined
                                            </span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="reimbursementStatus">Kulukorvaus / Reimbursement</Label>
                                <Select name="reimbursementStatus" defaultValue={transaction.reimbursementStatus || "not_requested"}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="not_requested">Ei haettu / Not Requested</SelectItem>
                                        <SelectItem value="requested">Haettu / Requested</SelectItem>
                                        <SelectItem value="approved">Hyväksytty / Approved</SelectItem>
                                        <SelectItem value="declined">Hylätty / Declined</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Purchase Info (if linked) */}
                    {purchase && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800 space-y-3">
                            <h3 className="font-bold text-blue-800 dark:text-blue-300">
                                Linkitetty kulukorvaus / Linked Reimbursement
                            </h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-blue-600 dark:text-blue-400">Ostaja / Purchaser</p>
                                    <p className="font-medium">{purchase.purchaserName}</p>
                                </div>
                                <div>
                                    <p className="text-blue-600 dark:text-blue-400">Tilinumero / IBAN</p>
                                    <p className="font-mono text-xs">{purchase.bankAccount}</p>
                                </div>
                                <div>
                                    <p className="text-blue-600 dark:text-blue-400">Pöytäkirja / Minutes</p>
                                    <p className="font-medium">{purchase.minutesId || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-blue-600 dark:text-blue-400">Sähköposti / Email</p>
                                    <p className="font-medium">{purchase.emailSent ? "✓ Lähetetty" : "✗ Ei lähetetty"}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Linked Inventory Items */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">

                        {/* Pending Items - To be added */}
                        <div className="space-y-4 mb-6">
                            <TransactionItemList
                                items={pendingItems}
                                onItemsChange={setPendingItems}
                                availableItems={pickerItems}
                                uniqueLocations={uniqueLocations}
                                uniqueCategories={uniqueCategories}
                                title="Lisättävät tavarat / Items to Add"
                                description="Valitse tavarat jotka linkitetään tähän tapahtumaan. / Select items to link to this transaction."
                                emptyMessage="Ei lisättäviä tavaroita / No items to add"
                                showTotal={false}
                            />

                            {pendingItems.length > 0 && (
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        onClick={handleLinkPendingItems}
                                        variant="default"
                                        className="gap-2"
                                    >
                                        <span className="material-symbols-outlined">link</span>
                                        Linkitä {pendingItems.length} tavaraa nyt / Link {pendingItems.length} items now
                                    </Button>
                                </div>
                            )}
                        </div>

                        {linkedItems.length === 0 && pendingItems.length === 0 ? (
                            <p className="text-gray-500 text-sm py-4 text-center">
                                Ei linkitettyjä tavaroita / No linked items
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {/* Linked items header? Or strictly separation? */}
                                {linkedItems.length > 0 && (
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-2">
                                        Linkitetyt tavarat / Linked Items
                                    </h3>
                                )}
                                {linkedItems.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-gray-400">package_2</span>
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {item.quantity} kpl • {item.location}
                                                    {item.value && parseFloat(item.value) > 0 && (
                                                        <span className="ml-2">{formatCurrency(parseFloat(item.value) * item.quantity)}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleUnlinkItem(item.id)}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <span className="material-symbols-outlined text-base">link_off</span>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigate(-1)}
                            className="flex-1"
                        >
                            Peruuta / Cancel
                        </Button>
                        <Button type="submit" className="flex-1" onClick={(e) => {
                            if (pendingItems.length > 0) {
                                e.preventDefault();
                                handleLinkPendingItems();
                                // Also submit the form manually if needed, but for now just link items
                                // Ideally we'd do both but fetcher is separate from form
                                // Let's just focus on linking items first as that's the main action for this context
                            }
                        }}>
                            {pendingItems.length > 0 ? "Tallenna linkitykset / Save Links" : "Tallenna / Save"}
                        </Button>
                    </div>
                </Form>

                {/* Delete section - separate from main form */}
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                        <AlertDialogTrigger asChild>
                            <Button
                                type="button"
                                variant="destructive"
                                className="w-full"
                            >
                                <span className="material-symbols-outlined mr-2">delete</span>
                                Poista tapahtuma / Delete Transaction
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Poista tapahtuma? / Delete transaction?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    <span className="block mb-2">
                                        Haluatko varmasti poistaa tämän tapahtuman? Tätä toimintoa ei voi peruuttaa.
                                    </span>
                                    <span className="block text-sm">
                                        Are you sure you want to delete this transaction? This action cannot be undone.
                                    </span>
                                    <span className="block mt-3 font-medium text-foreground">
                                        {transaction.description} ({formatCurrency(transaction.amount)})
                                    </span>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Peruuta / Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDelete}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    Poista / Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div >
        </PageWrapper >
    );
}
