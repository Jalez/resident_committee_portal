import { Form, Link, redirect, useSearchParams } from "react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db";
import {
    requirePermission,
    getAuthenticatedUser,
    requireDeletePermissionOrSelf,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.budgets.$budgetId";

export function meta({ data }: Route.MetaArgs) {
    const name = data?.budget?.name || "Budget";
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - ${name}`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    await requirePermission(request, "budgets:read", getDatabase);
    const authUser = await getAuthenticatedUser(request, getDatabase);

    const db = getDatabase();
    const budget = await db.getFundBudgetById(params.budgetId);

    if (!budget) {
        throw new Response("Not Found", { status: 404 });
    }

    // Get linked transactions
    const linkedTransactions = await db.getBudgetTransactions(
        budget.id,
    );
    const usedAmount = await db.getBudgetUsedAmount(budget.id);

    // Look up creator name when createdBy is set
    let createdByName: string | null = null;
    if (budget.createdBy) {
        const creator = await db.findUserById(budget.createdBy);
        createdByName = creator?.name ?? null;
    }

    return {
        siteConfig: SITE_CONFIG,
        budget: {
            ...budget,
            usedAmount,
            remainingAmount: Number.parseFloat(budget.amount) - usedAmount,
        },
        linkedTransactions,
        createdByName,
        languages: {
            primary: authUser?.primaryLanguage || "fi",
            secondary: authUser?.secondaryLanguage || "en",
        },
        currentUserId: authUser?.userId || null,
    };
}

export async function action({ request, params }: Route.ActionArgs) {
    const db = getDatabase();
    const budget = await db.getFundBudgetById(params.budgetId);

    if (!budget) {
        throw new Response("Not Found", { status: 404 });
    }

    const formData = await request.formData();
    const actionType = formData.get("_action");

    if (actionType === "delete") {
        // Check delete permission
        await requireDeletePermissionOrSelf(
            request,
            "budgets:delete",
            "budgets:delete-self",
            budget.createdBy,
            getDatabase,
        );

        const deleted = await db.deleteFundBudget(params.budgetId);
        if (!deleted) {
            return redirect(
                `/treasury/budgets/${params.budgetId}?error=has_transactions`,
            );
        }

        return redirect(`/treasury/budgets?year=${budget.year}&success=deleted`);
    }

    return null;
}

export default function TreasuryBudgetsView({
    loaderData,
}: Route.ComponentProps) {
    const {
        budget,
        linkedTransactions,
        createdByName,
        languages,
        currentUserId,
    } = loaderData;
    const { t, i18n } = useTranslation();
    const { hasPermission } = useUser();
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        const success = searchParams.get("success");
        if (success) {
            const successMessages: Record<string, string> = {
                updated: "treasury.budgets.success.updated",
                closed: "treasury.budgets.success.closed",
                reopened: "treasury.budgets.success.reopened",
            };
            toast.success(t(successMessages[success] || success));
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("success");
            setSearchParams(nextParams, { replace: true });
        }
    }, [searchParams, setSearchParams, t]);

    // Permissions
    const canUpdate =
        hasPermission("budgets:update") ||
        (hasPermission("budgets:update-self") &&
            budget.createdBy === currentUserId);
    const canDelete =
        hasPermission("budgets:delete") ||
        (hasPermission("budgets:delete-self") &&
            budget.createdBy === currentUserId);

    const formatCurrency = (value: number) => {
        return `${value.toFixed(2).replace(".", ",")} €`;
    };

    const formatDate = (date: Date | string) =>
        new Date(date).toLocaleDateString(
            i18n.language === "fi" ? "fi-FI" : "en-US",
        );

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: t("treasury.budgets.view.title", {
                        lng: languages.primary,
                    }),
                    secondary: t("treasury.budgets.view.title", {
                        lng: languages.secondary,
                    }),
                }}
            >
                <div className="space-y-6">
                    {/* Main info card */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="text-2xl">{budget.name}</CardTitle>
                                    {budget.description && (
                                        <CardDescription className="mt-2">
                                            {budget.description}
                                        </CardDescription>
                                    )}
                                </div>
                                <Badge
                                    variant={
                                        budget.status === "open" ? "default" : "secondary"
                                    }
                                >
                                    {t(`treasury.budgets.statuses.${budget.status}`)}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Amounts */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                        {t("treasury.budgets.amount")}
                                    </p>
                                    <p className="text-2xl font-bold">
                                        {formatCurrency(Number.parseFloat(budget.amount))}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                        {t("treasury.budgets.used")}
                                    </p>
                                    <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                                        {formatCurrency(budget.usedAmount)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                        {t("treasury.budgets.remaining")}
                                    </p>
                                    <p
                                        className={`text-2xl font-bold ${budget.remainingAmount > 0 ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}
                                    >
                                        {formatCurrency(budget.remainingAmount)}
                                    </p>
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">
                                        {t("treasury.budgets.year")}
                                    </p>
                                    <p className="font-medium">{budget.year}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">
                                        {t("treasury.budgets.created_by")}
                                    </p>
                                    <p className="font-medium">{createdByName || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">
                                        {t("treasury.budgets.created_at")}
                                    </p>
                                    <p className="font-medium">
                                        {formatDate(budget.createdAt)}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-4 border-t">
                                {canUpdate && (
                                    <Button variant="outline" asChild>
                                        <Link
                                            to={`/treasury/budgets/${budget.id}/edit`}
                                        >
                                            <span className="material-symbols-outlined mr-2 text-sm">
                                                edit
                                            </span>
                                            {t("treasury.budgets.actions.edit")}
                                        </Link>
                                    </Button>
                                )}

                                {canDelete && linkedTransactions.length === 0 && (
                                    <Form method="post">
                                        <input type="hidden" name="_action" value="delete" />
                                        <Button
                                            type="submit"
                                            variant="destructive"
                                            onClick={(e) => {
                                                if (
                                                    !confirm(t("treasury.budgets.delete_confirm"))
                                                ) {
                                                    e.preventDefault();
                                                }
                                            }}
                                        >
                                            <span className="material-symbols-outlined mr-2 text-sm">
                                                delete
                                            </span>
                                            {t("treasury.budgets.actions.delete")}
                                        </Button>
                                    </Form>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Linked Transactions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {t("treasury.budgets.linked_transactions")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {linkedTransactions.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t("treasury.breakdown.date")}
                                            </TableHead>
                                            <TableHead>
                                                {t("treasury.breakdown.description")}
                                            </TableHead>
                                            <TableHead className="text-right">
                                                {t("treasury.breakdown.amount")}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {linkedTransactions.map(({ transaction, amount }) => (
                                            <TableRow key={transaction.id}>
                                                <TableCell className="font-mono text-sm">
                                                    {formatDate(transaction.date)}
                                                </TableCell>
                                                <TableCell>
                                                    <Link
                                                        to={`/treasury/transactions/${transaction.id}`}
                                                        className="hover:underline text-primary"
                                                    >
                                                        {transaction.description}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {formatCurrency(Number.parseFloat(amount))}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-center py-6 text-muted-foreground">
                                    {t("treasury.budgets.no_transactions")}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}
