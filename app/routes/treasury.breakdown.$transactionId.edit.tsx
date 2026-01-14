import type { Route } from "./+types/treasury.breakdown.$transactionId.edit";
import { Form, redirect, useNavigate } from "react-router";
import { requireStaff } from "~/lib/auth.server";
import { getDatabase, type Transaction, type TransactionStatus, type ReimbursementStatus } from "~/db";
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
    await requireStaff(request, getDatabase);
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

    return {
        siteConfig: SITE_CONFIG,
        transaction,
        purchase,
    };
}

export async function action({ request, params }: Route.ActionArgs) {
    await requireStaff(request, getDatabase);
    const db = getDatabase();

    const formData = await request.formData();
    const status = formData.get("status") as TransactionStatus;
    const reimbursementStatus = formData.get("reimbursementStatus") as ReimbursementStatus;
    const description = formData.get("description") as string;
    const category = (formData.get("category") as string) || null;

    // Get transaction to preserve year for redirect
    const transactions = await db.getAllTransactions();
    const transaction = transactions.find(t => t.id === params.transactionId);
    const year = transaction?.year || new Date().getFullYear();

    await db.updateTransaction(params.transactionId, {
        status,
        reimbursementStatus,
        description,
        category,
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
    const { transaction, purchase } = loaderData as { transaction: Transaction; purchase: any };
    const navigate = useNavigate();

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString("fi-FI");
    };

    const formatCurrency = (value: string) => {
        return parseFloat(value).toFixed(2).replace(".", ",") + " €";
    };

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Muokkaa tapahtumaa
                    </h1>
                    <p className="text-lg text-gray-500">Edit Transaction</p>
                </div>

                <Form method="post" className="space-y-6">
                    {/* Transaction Info (read-only summary) */}
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm text-gray-500">Päivämäärä / Date</p>
                                <p className="font-mono">{formatDate(transaction.date)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500">Summa / Amount</p>
                                <p className={`font-bold text-lg ${transaction.type === "expense" ? "text-red-600" : "text-green-600"}`}>
                                    {transaction.type === "expense" ? "-" : "+"}{formatCurrency(transaction.amount)}
                                </p>
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
                            Tallenna / Save
                        </Button>
                    </div>
                </Form>
            </div>
        </PageWrapper>
    );
}
