import type { Route } from "./+types/admin.budget";
import { Form, useNavigate, useRouteLoaderData } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { getDatabase, type NewBudget, type NewTransaction } from "~/db";
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
import type { loader as rootLoader } from "~/root";

export function meta({ data }: Route.MetaArgs) {
    return [
        { title: `${data?.siteConfig?.name || "Portal"} - Budjettihallinta / Budget Management` },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requireAdmin(request);
    const db = getDatabase();

    const budgets = await db.getAllBudgets();
    const transactions = await db.getAllTransactions();

    return {
        siteConfig: SITE_CONFIG,
        budgets: budgets.sort((a, b) => b.year - a.year),
        transactionCount: transactions.length,
        currentYear: new Date().getFullYear(),
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requireAdmin(request);
    const db = getDatabase();
    const formData = await request.formData();
    const actionType = formData.get("_action");

    if (actionType === "createBudget") {
        const year = parseInt(formData.get("year") as string);
        const allocation = formData.get("allocation") as string;
        const notes = formData.get("notes") as string;

        const existing = await db.getBudgetByYear(year);
        if (existing) {
            await db.updateBudget(existing.id, { allocation, notes: notes || null });
        } else {
            const newBudget: NewBudget = {
                year,
                allocation,
                notes: notes || null,
            };
            await db.createBudget(newBudget);
        }
    } else if (actionType === "addTransaction") {
        const year = parseInt(formData.get("year") as string);
        const type = formData.get("type") as "income" | "expense";
        const amount = formData.get("amount") as string;
        const description = formData.get("description") as string;
        const category = formData.get("category") as string;
        const date = new Date(formData.get("date") as string);

        const newTransaction: NewTransaction = {
            year,
            type,
            amount,
            description,
            category: category || null,
            date,
        };
        await db.createTransaction(newTransaction);
    } else if (actionType === "deleteTransaction") {
        const transactionId = formData.get("transactionId") as string;
        await db.deleteTransaction(transactionId);
    }

    return { success: true };
}

export default function AdminBudget({ loaderData }: Route.ComponentProps) {
    const { budgets, currentYear } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const isAdmin = rootData?.user?.role === "admin";
    const navigate = useNavigate();

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
            <div className="w-full max-w-2xl mx-auto px-4">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Budjettihallinta
                    </h1>
                    <p className="text-lg text-gray-500">Budget Management</p>
                </div>

                {/* Create/Update Budget */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
                    <h2 className="text-lg font-bold mb-4">Luo/päivitä budjetti / Create/Update Budget</h2>
                    <Form method="post" className="space-y-4">
                        <input type="hidden" name="_action" value="createBudget" />

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="year">Vuosi / Year</Label>
                                <Input
                                    id="year"
                                    name="year"
                                    type="number"
                                    min="2020"
                                    max="2100"
                                    defaultValue={currentYear}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="allocation">Kokonaisbudjetti € / Total €</Label>
                                <Input
                                    id="allocation"
                                    name="allocation"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="500.00"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Huomautukset / Notes</Label>
                            <Input id="notes" name="notes" placeholder="Vapaaehtoinen" />
                        </div>

                        <Button type="submit">Tallenna budjetti / Save Budget</Button>
                    </Form>
                </div>

                {/* Add Transaction */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
                    <h2 className="text-lg font-bold mb-4">Lisää tapahtuma / Add Transaction</h2>
                    <Form method="post" className="space-y-4">
                        <input type="hidden" name="_action" value="addTransaction" />

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="txYear">Vuosi / Year</Label>
                                <Input
                                    id="txYear"
                                    name="year"
                                    type="number"
                                    defaultValue={currentYear}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Tyyppi / Type</Label>
                                <Select name="type" defaultValue="expense">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="expense">Kulu / Expense</SelectItem>
                                        <SelectItem value="income">Tulo / Income</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Summa € / Amount €</Label>
                                <Input
                                    id="amount"
                                    name="amount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">Päivämäärä / Date</Label>
                                <Input
                                    id="date"
                                    name="date"
                                    type="date"
                                    defaultValue={new Date().toISOString().split("T")[0]}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Kuvaus / Description</Label>
                            <Input id="description" name="description" required placeholder="Esim. Nintendo Switch" />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="category">Kategoria / Category</Label>
                            <Input id="category" name="category" placeholder="Esim. Viihde-elektroniikka" />
                        </div>

                        <Button type="submit">Lisää tapahtuma / Add Transaction</Button>
                    </Form>
                </div>

                {/* Existing Budgets */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold mb-4">Budjetit / Budgets</h2>
                    {budgets.length === 0 ? (
                        <p className="text-gray-500">Ei budjetteja / No budgets</p>
                    ) : (
                        <div className="space-y-2">
                            {budgets.map(budget => (
                                <div
                                    key={budget.id}
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                                >
                                    <div>
                                        <span className="font-bold text-lg">{budget.year}</span>
                                        <span className="ml-4 text-primary font-bold">
                                            {parseFloat(budget.allocation).toFixed(2).replace(".", ",")} €
                                        </span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(`/budget/breakdown?year=${budget.year}`)}
                                    >
                                        Katso / View
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageWrapper>
    );
}
