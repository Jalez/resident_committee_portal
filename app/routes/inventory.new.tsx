import type { Route } from "./+types/inventory.new";
import { Form, redirect, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { requireStaff } from "~/lib/auth.server";
import { getDatabase, type NewInventoryItem, type NewPurchase, type NewTransaction } from "~/db";
import { getMinutesByYear } from "~/lib/google.server";
import { sendReimbursementEmail, isEmailConfigured } from "~/lib/email.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Uusi tavara / New Item` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requireStaff(request, getDatabase);
    const db = getDatabase();

    // Get recent minutes for dropdown
    const minutesByYear = await getMinutesByYear();
    const recentMinutes = minutesByYear.flatMap(year =>
        year.files.map(file => ({
            id: file.id,
            name: file.name,
            year: year.year,
        }))
    ).slice(0, 20);

    // Get recent transactions for duplicate detection
    const currentYear = new Date().getFullYear();
    const transactions = await db.getTransactionsByYear(currentYear);
    const recentTransactions = transactions
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)
        .map(t => ({
            amount: t.amount,
            description: t.description,
            date: t.date,
        }));

    return {
        siteConfig: SITE_CONFIG,
        recentMinutes,
        recentTransactions,
        emailConfigured: isEmailConfigured(),
        currentYear,
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requireStaff(request, getDatabase);
    const db = getDatabase();

    const formData = await request.formData();
    const addToTreasury = formData.get("addToTreasury") === "on";
    const requestReimbursement = formData.get("requestReimbursement") === "on";

    // Create inventory item
    const newItem: NewInventoryItem = {
        name: formData.get("name") as string,
        quantity: parseInt(formData.get("quantity") as string) || 1,
        location: formData.get("location") as string,
        category: (formData.get("category") as string) || null,
        description: (formData.get("description") as string) || null,
        value: formData.get("value") as string || "0",
        purchasedAt: formData.get("purchasedAt")
            ? new Date(formData.get("purchasedAt") as string)
            : null,
    };

    const inventoryItem = await db.createInventoryItem(newItem);

    // If adding to treasury, create transaction
    if (addToTreasury) {
        const currentYear = new Date().getFullYear();

        // Determine status based on reimbursement request
        const status = requestReimbursement ? "pending" : "complete";
        const reimbursementStatus = requestReimbursement ? "requested" : "not_requested";

        let purchaseId: string | null = null;

        // If requesting reimbursement, create purchase record first
        if (requestReimbursement) {
            const purchaserName = formData.get("purchaserName") as string;
            const bankAccount = formData.get("bankAccount") as string;
            const minutesId = formData.get("minutesId") as string;
            const notes = formData.get("notes") as string;
            const receiptFile = formData.get("receipt") as File | null;

            const newPurchase: NewPurchase = {
                inventoryItemId: inventoryItem.id,
                description: newItem.name,
                amount: newItem.value || "0",
                purchaserName,
                bankAccount,
                minutesId: minutesId,
                minutesName: null,
                notes: notes || null,
                status: "pending",
                year: currentYear,
                emailSent: false,
            };

            const purchase = await db.createPurchase(newPurchase);
            purchaseId = purchase.id;

            // Send email with receipt if file provided
            if (receiptFile && receiptFile.size > 0) {
                try {
                    const arrayBuffer = await receiptFile.arrayBuffer();
                    const base64Content = Buffer.from(arrayBuffer).toString("base64");

                    await sendReimbursementEmail(
                        {
                            itemName: newItem.name,
                            itemValue: newItem.value || "0",
                            purchaserName,
                            bankAccount,
                            minutesReference: minutesId || "Ei määritetty / Not specified",
                            notes,
                        },
                        {
                            name: receiptFile.name,
                            type: receiptFile.type,
                            content: base64Content,
                        }
                    );
                    await db.updatePurchase(purchase.id, { emailSent: true });
                } catch (error) {
                    await db.updatePurchase(purchase.id, {
                        emailError: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            } else {
                // Send email without attachment
                try {
                    await sendReimbursementEmail({
                        itemName: newItem.name,
                        itemValue: newItem.value || "0",
                        purchaserName,
                        bankAccount,
                        minutesReference: minutesId || "Ei määritetty / Not specified",
                        notes,
                    });
                    await db.updatePurchase(purchase.id, { emailSent: true });
                } catch (error) {
                    await db.updatePurchase(purchase.id, {
                        emailError: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            }
        }

        // Create treasury transaction linked to this inventory item
        const newTransaction: NewTransaction = {
            type: "expense",
            amount: newItem.value || "0",
            description: `Hankinta: ${newItem.name}`,
            category: newItem.category || "Tarvikkeet",
            date: newItem.purchasedAt || new Date(),
            year: currentYear,
            status,
            reimbursementStatus,
            purchaseId,
            inventoryItemId: inventoryItem.id,
        };

        await db.createTransaction(newTransaction);
    }

    return redirect("/inventory");
}

export default function NewInventoryItem({ loaderData }: Route.ComponentProps) {
    const { recentMinutes, recentTransactions, emailConfigured, currentYear } = loaderData ?? {
        recentMinutes: [] as Array<{ id: string; name: string; year: number }>,
        recentTransactions: [] as Array<{ amount: string; description: string; date: Date }>,
        emailConfigured: false,
        currentYear: new Date().getFullYear(),
    };
    const navigate = useNavigate();
    const [addToTreasury, setAddToTreasury] = useState(false);
    const [requestReimbursement, setRequestReimbursement] = useState(false);
    const [itemValue, setItemValue] = useState("0");
    const [itemName, setItemName] = useState("");
    const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

    // When addToTreasury is unchecked, also uncheck reimbursement
    useEffect(() => {
        if (!addToTreasury) {
            setRequestReimbursement(false);
        }
    }, [addToTreasury]);

    // Check for potential duplicates when value or name changes
    useEffect(() => {
        if (!addToTreasury || !itemValue || parseFloat(itemValue) === 0) {
            setDuplicateWarning(null);
            return;
        }

        const similarTransactions = recentTransactions.filter(t => {
            const amountMatch = Math.abs(parseFloat(t.amount) - parseFloat(itemValue)) < 0.01;
            const nameMatch = itemName && t.description.toLowerCase().includes(itemName.toLowerCase());
            return amountMatch || nameMatch;
        });

        if (similarTransactions.length > 0) {
            const examples = similarTransactions.slice(0, 2).map(t =>
                `"${t.description}" (${parseFloat(t.amount).toFixed(2)}€)`
            ).join(", ");
            setDuplicateWarning(`Mahdollinen duplikaatti: ${examples}. Varmista, ettei samanlaista tapahtumaa ole jo lisätty.`);
        } else {
            setDuplicateWarning(null);
        }
    }, [itemValue, itemName, addToTreasury, recentTransactions]);

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Uusi tavara
                    </h1>
                    <p className="text-lg text-gray-500">New Item</p>
                </div>

                <Form method="post" encType="multipart/form-data" className="space-y-6">
                    {/* Basic Item Info */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Tavaran tiedot / Item Details
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nimi / Name *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    required
                                    placeholder="Esim. Kahvinkeitin"
                                    value={itemName}
                                    onChange={(e) => setItemName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="quantity">Määrä / Quantity *</Label>
                                <Input
                                    id="quantity"
                                    name="quantity"
                                    type="number"
                                    min="1"
                                    required
                                    defaultValue={1}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="location">Sijainti / Location *</Label>
                                <Input
                                    id="location"
                                    name="location"
                                    required
                                    placeholder="Esim. Kerhohuone"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Kategoria / Category</Label>
                                <Input
                                    id="category"
                                    name="category"
                                    placeholder="Esim. Keittiö"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Kuvaus / Description</Label>
                            <Input
                                id="description"
                                name="description"
                                placeholder="Vapaamuotoinen kuvaus"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="value">Arvo € / Value €</Label>
                                <Input
                                    id="value"
                                    name="value"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={itemValue}
                                    onChange={(e) => setItemValue(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchasedAt">Hankintapäivä / Purchase Date</Label>
                                <Input
                                    id="purchasedAt"
                                    name="purchasedAt"
                                    type="date"
                                    defaultValue={new Date().toISOString().split("T")[0]}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Treasury Transaction Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="addToTreasury"
                                name="addToTreasury"
                                checked={addToTreasury}
                                onCheckedChange={(checked) => setAddToTreasury(checked === true)}
                            />
                            <Label htmlFor="addToTreasury" className="text-lg font-bold cursor-pointer">
                                Lisää rahastotapahtuma / Add Treasury Transaction
                            </Label>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Valitse jos haluat luoda menon rahaston erittelyyn tämän hankinnan perusteella.
                            <br />
                            Check if you want to create an expense entry in the treasury based on this item.
                        </p>

                        {/* Duplicate Warning */}
                        {duplicateWarning && (
                            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                                <p className="text-sm text-orange-800 dark:text-orange-200">
                                    ⚠️ {duplicateWarning}
                                    <br />
                                    <span className="text-orange-600 dark:text-orange-300">
                                        Possible duplicate detected. Make sure a similar transaction hasn't already been added.
                                    </span>
                                </p>
                            </div>
                        )}

                        {/* Reimbursement Section - only if treasury is checked */}
                        {addToTreasury && (
                            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="requestReimbursement"
                                        name="requestReimbursement"
                                        checked={requestReimbursement}
                                        onCheckedChange={(checked) => setRequestReimbursement(checked === true)}
                                    />
                                    <Label htmlFor="requestReimbursement" className="font-bold cursor-pointer">
                                        Hae kulukorvausta / Request Reimbursement
                                    </Label>
                                </div>

                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Valitse jos haluat hakea kulukorvausta määrärahasta.
                                    <br />
                                    Check if you want to request reimbursement from the allowance.
                                </p>

                                {/* Reimbursement Details - only if reimbursement is checked */}
                                {requestReimbursement && (
                                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        {!emailConfigured && (
                                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                                    ⚠️ Sähköpostilähetys ei ole konfiguroitu. Pyyntö tallennetaan, mutta sähköpostia ei lähetetä.
                                                    <br />
                                                    Email sending is not configured. Request will be saved but email won't be sent.
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label htmlFor="receipt">Kuitti / Receipt (PDF tai kuva) *</Label>
                                            <Input
                                                id="receipt"
                                                name="receipt"
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                                required={requestReimbursement}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="purchaserName">Ostajan nimi / Purchaser Name *</Label>
                                                <Input
                                                    id="purchaserName"
                                                    name="purchaserName"
                                                    required={requestReimbursement}
                                                    placeholder="Etu- ja sukunimi"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="bankAccount">Tilinumero (IBAN) / Bank Account *</Label>
                                                <Input
                                                    id="bankAccount"
                                                    name="bankAccount"
                                                    required={requestReimbursement}
                                                    placeholder="FI12 3456 7890 1234 56"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="minutesId">Pöytäkirja / Related Minutes *</Label>
                                            <Select name="minutesId" defaultValue={recentMinutes[0]?.id || ""} required={requestReimbursement}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Valitse pöytäkirja..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {recentMinutes.map((minute) => (
                                                        <SelectItem key={minute.id} value={minute.id}>
                                                            {minute.name} ({minute.year})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-gray-500">
                                                Yli 100€ hankinnoissa pöytäkirja vaaditaan ennen maksua.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="notes">Lisätiedot / Additional Notes</Label>
                                            <textarea
                                                id="notes"
                                                name="notes"
                                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                                                placeholder="Vapaamuotoinen viesti..."
                                            />
                                        </div>
                                    </div>
                                )}
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
                        <Button type="submit" className="flex-1">
                            {requestReimbursement
                                ? "Lisää ja hae korvausta / Add & Request Reimbursement"
                                : addToTreasury
                                    ? "Lisää tavaraan ja rahastoon / Add to Inventory & Treasury"
                                    : "Lisää / Add"
                            }
                        </Button>
                    </div>
                </Form>
            </div>
        </PageWrapper>
    );
}
