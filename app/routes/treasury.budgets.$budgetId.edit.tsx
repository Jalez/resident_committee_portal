import { Form, redirect, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
    ContentArea,
    PageWrapper,
    SplitLayout,
} from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { getDatabase } from "~/db";
import {
    getAuthenticatedUser,
    requirePermissionOrSelf,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.budgets.$budgetId.edit";

export function meta({ data }: Route.MetaArgs) {
    const name = data?.budget?.name || "Budget";
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - ${name} Edit`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    const db = getDatabase();
    const budget = await db.getFundBudgetById(params.budgetId);

    if (!budget) {
        throw new Response("Not Found", { status: 404 });
    }

    // Check permission
    await requirePermissionOrSelf(
        request,
        "budgets:update",
        "budgets:update-self",
        budget.createdBy,
        getDatabase,
    );

    const authUser = await getAuthenticatedUser(request, getDatabase);

    // Get used amount to prevent reducing below it
    const usedAmount = await db.getBudgetUsedAmount(budget.id);

    // Get available funds
    const availableFunds = await db.getAvailableFundsForYear(budget.year);

    return {
        siteConfig: SITE_CONFIG,
        budget: {
            ...budget,
            usedAmount,
            remainingAmount: Number.parseFloat(budget.amount) - usedAmount,
        },
        availableFunds,
        languages: {
            primary: authUser?.primaryLanguage || "fi",
            secondary: authUser?.secondaryLanguage || "en",
        },
    };
}

const updateBudgetSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
});

export async function action({ request, params }: Route.ActionArgs) {
    const db = getDatabase();
    const budget = await db.getFundBudgetById(params.budgetId);

    if (!budget) {
        throw new Response("Not Found", { status: 404 });
    }

    // Check permission
    await requirePermissionOrSelf(
        request,
        "budgets:update",
        "budgets:update-self",
        budget.createdBy,
        getDatabase,
    );

    const formData = await request.formData();
    const actionType = formData.get("_action") as string | null;

    if (actionType === "close") {
        await db.updateFundBudget(params.budgetId, { status: "closed" });
        return redirect(
            `/treasury/budgets/${params.budgetId}?success=closed`,
        );
    }

    if (actionType === "reopen") {
        await db.updateFundBudget(params.budgetId, { status: "open" });
        return redirect(
            `/treasury/budgets/${params.budgetId}?success=reopened`,
        );
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const amountStr = formData.get("amount") as string;

    // Validate
    const result = updateBudgetSchema.safeParse({
        name,
        description,
        amount: amountStr,
    });

    if (!result.success) {
        return {
            error: "Validation failed",
            fieldErrors: result.error.flatten().fieldErrors,
        };
    }

    // Parse amount
    const newAmount = Number.parseFloat(amountStr.replace(",", "."));

    // Get used amount
    const usedAmount = await db.getBudgetUsedAmount(params.budgetId);

    // Cannot reduce below used amount
    if (newAmount < usedAmount) {
        return {
            error: "cannot_reduce",
            usedAmount,
        };
    }

    // Check available funds if increasing
    const currentAmount = Number.parseFloat(budget.amount);
    if (newAmount > currentAmount) {
        const increase = newAmount - currentAmount;
        const availableFunds = await db.getAvailableFundsForYear(budget.year);

        if (increase > availableFunds) {
            return {
                error: "insufficient_funds",
                availableFunds,
            };
        }
    }

    // Update budget
    await db.updateFundBudget(params.budgetId, {
        name,
        description: description || null,
        amount: newAmount.toFixed(2),
    });

    return redirect(
        `/treasury/budgets/${params.budgetId}?success=updated`,
    );
}

export default function TreasuryBudgetsEdit({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const { budget, availableFunds, languages } = loaderData;
    const { t } = useTranslation();
    const navigate = useNavigate();

    const formatCurrency = (value: number) => {
        return `${value.toFixed(2).replace(".", ",")} €`;
    };

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: t("treasury.budgets.edit.title", {
                        lng: languages.primary,
                    }),
                    secondary: t("treasury.budgets.edit.title", {
                        lng: languages.secondary,
                    }),
                }}
            >
                <ContentArea>
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("treasury.budgets.edit.title")}</CardTitle>
                            <CardDescription>
                                {t("treasury.budgets.available_funds")}:{" "}
                                <span
                                    className={
                                        availableFunds >= 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-600 dark:text-red-400"
                                    }
                                >
                                    {formatCurrency(availableFunds)}
                                </span>
                                {" | "}
                                {t("treasury.budgets.used")}:{" "}
                                <span className="text-gray-600 dark:text-gray-400">
                                    {formatCurrency(budget.usedAmount)}
                                </span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                {actionData?.error === "insufficient_funds" && (
                                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
                                        {t("treasury.budgets.insufficient_funds", {
                                            available: formatCurrency(
                                                actionData.availableFunds as number,
                                            ),
                                        })}
                                    </div>
                                )}

                                {actionData?.error === "cannot_reduce" && (
                                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
                                        {t("treasury.budgets.cannot_reduce", {
                                            used: formatCurrency(actionData.usedAmount as number),
                                        })}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="name">{t("treasury.budgets.name")}</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        defaultValue={budget.name}
                                        placeholder={t("treasury.budgets.name_placeholder")}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">
                                        {t("treasury.budgets.description")}
                                    </Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        defaultValue={budget.description || ""}
                                        placeholder={t(
                                            "treasury.budgets.description_placeholder",
                                        )}
                                        rows={3}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="amount">
                                        {t("treasury.budgets.amount")} (€)
                                    </Label>
                                    <Input
                                        id="amount"
                                        name="amount"
                                        type="text"
                                        inputMode="decimal"
                                        defaultValue={Number.parseFloat(budget.amount)
                                            .toFixed(2)
                                            .replace(".", ",")}
                                        placeholder="0,00"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {t("treasury.budgets.cannot_reduce", {
                                            used: formatCurrency(budget.usedAmount),
                                        }).replace("Cannot reduce amount below used amount", "Minimum")}
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-3 pt-4">
                                    <Button type="submit">
                                        {t("treasury.budgets.form.save")}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            navigate(`/treasury/budgets/${budget.id}`)
                                        }
                                    >
                                        {t("treasury.budgets.form.cancel")}
                                    </Button>

                                    {budget.status === "open" ? (
                                        <Form method="post" className="inline-block">
                                            <input type="hidden" name="_action" value="close" />
                                            <Button
                                                type="submit"
                                                variant="outline"
                                                onClick={(e) => {
                                                    const remaining = formatCurrency(
                                                        Number.parseFloat(budget.amount) -
                                                            budget.usedAmount,
                                                    );
                                                    if (
                                                        !confirm(
                                                            t("treasury.budgets.close_confirm", {
                                                                amount: remaining,
                                                            }),
                                                        )
                                                    ) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                <span className="material-symbols-outlined mr-2 text-sm">
                                                    lock
                                                </span>
                                                {t("treasury.budgets.actions.close")}
                                            </Button>
                                        </Form>
                                    ) : (
                                        <Form method="post" className="inline-block">
                                            <input type="hidden" name="_action" value="reopen" />
                                            <Button
                                                type="submit"
                                                variant="outline"
                                                onClick={(e) => {
                                                    if (
                                                        !confirm(
                                                            t("treasury.budgets.reopen_confirm"),
                                                        )
                                                    ) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                <span className="material-symbols-outlined mr-2 text-sm">
                                                    lock_open
                                                </span>
                                                {t("treasury.budgets.actions.reopen")}
                                            </Button>
                                        </Form>
                                    )}
                                </div>
                            </Form>
                        </CardContent>
                    </Card>
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
