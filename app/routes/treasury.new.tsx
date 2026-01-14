import type { Route } from "./+types/treasury.new";
import { Form, redirect, useNavigate } from "react-router";
import { useState } from "react";
import { requireStaff } from "~/lib/auth.server";
import { getDatabase, type NewTransaction, type NewPurchase } from "~/db";
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
        { title: `${data?.siteConfig?.name || "Portal"} - Uusi tapahtuma / New Transaction` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requireStaff(request, getDatabase);

    // Get recent minutes for dropdown
    const minutesByYear = await getMinutesByYear();
    const recentMinutes = minutesByYear.flatMap(year =>
        year.files.map(file => ({
            id: file.id,
            name: file.name,
            year: year.year,
        }))
    ).slice(0, 20);

    return {
        siteConfig: SITE_CONFIG,
        currentYear: new Date().getFullYear(),
        recentMinutes,
        emailConfigured: isEmailConfigured(),
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requireStaff(request, getDatabase);
    const db = getDatabase();

    const formData = await request.formData();
    const type = formData.get("type") as "income" | "expense";
    const amount = formData.get("amount") as string;
    const description = formData.get("description") as string;
    const category = (formData.get("category") as string) || null;
    const dateString = formData.get("date") as string;
    const year = parseInt(formData.get("year") as string);
    const requestReimbursement = formData.get("requestReimbursement") === "on";

    // Determine status based on reimbursement request
    const status = requestReimbursement ? "pending" : "complete";
    const reimbursementStatus = requestReimbursement ? "requested" : "not_requested";

    // Create purchase record if reimbursement requested
    let purchaseId: string | null = null;

    if (requestReimbursement) {
        const purchaserName = formData.get("purchaserName") as string;
        const bankAccount = formData.get("bankAccount") as string;
        const minutesId = formData.get("minutesId") as string;
        const notes = formData.get("notes") as string;
        const receiptFile = formData.get("receipt") as File | null;

        const newPurchase: NewPurchase = {
            description,
            amount,
            purchaserName,
            bankAccount,
            minutesId,
            minutesName: null,
            notes: notes || null,
            status: "pending",
            year,
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
                        itemName: description,
                        itemValue: amount,
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
                    itemName: description,
                    itemValue: amount,
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

    const newTransaction: NewTransaction = {
        type,
        amount,
        description,
        category,
        date: new Date(dateString),
        year,
        status,
        reimbursementStatus,
        purchaseId,
    };

    await db.createTransaction(newTransaction);

    return redirect(`/treasury?year=${year}`);
}

export default function NewTransaction({ loaderData }: Route.ComponentProps) {
    const { currentYear, recentMinutes, emailConfigured } = loaderData ?? {
        currentYear: new Date().getFullYear(),
        recentMinutes: [] as Array<{ id: string; name: string; year: number }>,
        emailConfigured: false,
    };
    const navigate = useNavigate();
    const [requestReimbursement, setRequestReimbursement] = useState(false);

    // Generate year options (last 5 years)
    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Uusi tapahtuma
                    </h1>
                    <p className="text-lg text-gray-500">New Transaction</p>
                </div>

                <Form method="post" encType="multipart/form-data" className="space-y-6">
                    {/* Transaction Details */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Tapahtuman tiedot / Transaction Details
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="type">Tyyppi / Type *</Label>
                                <Select name="type" defaultValue="expense" required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Valitse tyyppi..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="income">
                                            <span className="flex items-center gap-2">
                                                <span className="text-green-600">+</span>
                                                Tulo / Income
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="expense">
                                            <span className="flex items-center gap-2">
                                                <span className="text-red-600">-</span>
                                                Meno / Expense
                                            </span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">Summa € / Amount € *</Label>
                                <Input
                                    id="amount"
                                    name="amount"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    required
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Kuvaus / Description *</Label>
                            <Input
                                id="description"
                                name="description"
                                required
                                placeholder="Esim. Kahvitarjoilut, Kokoukseen hankitut eväät"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="category">Kategoria / Category</Label>
                                <Input
                                    id="category"
                                    name="category"
                                    placeholder="Esim. Eväät, Tarvikkeet"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">Päivämäärä / Date *</Label>
                                <Input
                                    id="date"
                                    name="date"
                                    type="date"
                                    required
                                    defaultValue={new Date().toISOString().split("T")[0]}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="year">Vuosi / Year *</Label>
                            <Select name="year" defaultValue={currentYear.toString()} required>
                                <SelectTrigger>
                                    <SelectValue placeholder="Valitse vuosi..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearOptions.map((year) => (
                                        <SelectItem key={year} value={year.toString()}>
                                            {year}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Reimbursement Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="requestReimbursement"
                                name="requestReimbursement"
                                checked={requestReimbursement}
                                onCheckedChange={(checked) => setRequestReimbursement(checked === true)}
                            />
                            <Label htmlFor="requestReimbursement" className="text-lg font-bold cursor-pointer">
                                Hae kulukorvausta / Request Reimbursement
                            </Label>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Valitse jos haluat hakea kulukorvausta tästä menosta määrärahasta.
                            <br />
                            Check if you want to request reimbursement from the allowance.
                        </p>

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
                                : "Lisää / Add"
                            }
                        </Button>
                    </div>
                </Form>
            </div>
        </PageWrapper>
    );
}
