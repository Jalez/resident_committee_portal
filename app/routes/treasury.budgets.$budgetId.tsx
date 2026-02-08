import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
    TREASURY_BUDGET_STATUS_VARIANTS,
    TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/treasury/colored-status-link-badge";
import {
    TreasuryDetailCard,
    TreasuryField,
    TreasuryRelationList,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Separator } from "~/components/ui/separator";
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
    await requirePermission(request, "treasury:budgets:read", getDatabase);
    const authUser = await getAuthenticatedUser(request, getDatabase);

    const db = getDatabase();
    const budget = await db.getFundBudgetById(params.budgetId);

    if (!budget) {
        throw new Response("Not Found", { status: 404 });
    }

    // Get linked transactions
    const linkedTransactions = await db.getBudgetTransactions(budget.id);

    return {
        siteConfig: SITE_CONFIG,
        budget,
        linkedTransactions,
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
            "treasury:budgets:delete",
            "treasury:budgets:delete-self",
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
        currentUserId,
    } = loaderData;
    const { t } = useTranslation();
    const { hasPermission } = useUser();
    const [searchParams, setSearchParams] = useSearchParams();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const deleteFormRef = useRef<HTMLFormElement>(null);

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
        hasPermission("treasury:budgets:update") ||
        (hasPermission("treasury:budgets:update-self") &&
            budget.createdBy === currentUserId);
    const canDelete =
        hasPermission("treasury:budgets:delete") ||
        (hasPermission("treasury:budgets:delete-self") &&
            budget.createdBy === currentUserId);

    const formatCurrency = (value: number) => {
        return `${value.toFixed(2).replace(".", ",")} €`;
    };

    const transactionRelations = linkedTransactions.map(({ transaction }) => ({
        to: `/treasury/transactions/${transaction.id}`,
        title: transaction.description || transaction.id.substring(0, 8),
        status: transaction.status,
        id: transaction.id,
        variantMap: TREASURY_TRANSACTION_STATUS_VARIANTS,
    }));

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4 pb-12">
                <div className="flex items-center justify-between mb-4">
                    <PageHeader title={t("treasury.budgets.view.title")} />
                    {canUpdate && (
                        <Button variant="default" asChild>
                            <Link to={`/treasury/budgets/${budget.id}/edit`}>
                                <span className="material-symbols-outlined mr-2 text-sm">
                                    edit
                                </span>
                                {t("treasury.budgets.actions.edit")}
                            </Link>
                        </Button>
                    )}
                </div>
                <div className="space-y-6">
                    <TreasuryDetailCard title={t("treasury.budgets.view.title")}>
                        <div className="grid gap-4">
                            <TreasuryField
                                label={t("treasury.budgets.name", "Name")}
                                valueClassName="text-foreground font-semibold"
                            >
                                {budget.name}
                            </TreasuryField>
                            {budget.description ? (
                                <TreasuryField label={t("common.fields.description")}>
                                    {budget.description}
                                </TreasuryField>
                            ) : null}
                            <TreasuryField
                                label={t("treasury.budgets.amount")}
                                valueClassName="text-foreground font-bold"
                            >
                                {formatCurrency(Number.parseFloat(budget.amount))}
                            </TreasuryField>
                            <TreasuryField label={t("treasury.budgets.status")}
                                valueClassName="text-foreground"
                            >
                                <TreasuryStatusPill
                                    value={budget.status}
                                    variantMap={TREASURY_BUDGET_STATUS_VARIANTS}
                                    label={t(`treasury.budgets.statuses.${budget.status}`)}
                                />
                            </TreasuryField>
                            <TreasuryField label={t("treasury.budgets.year")}>
                                {budget.year}
                            </TreasuryField>
                        </div>

                        <TreasuryRelationList
                            label={t("treasury.budgets.linked_transactions")}
                            items={transactionRelations}
                            withSeparator
                        />

                        <Separator />
                        <div className="flex gap-2">
                            {canDelete && linkedTransactions.length === 0 && (
                                <>
                                    <Form method="post" className="hidden" ref={deleteFormRef}>
                                        <input type="hidden" name="_action" value="delete" />
                                    </Form>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={() => setShowDeleteConfirm(true)}
                                    >
                                        <span className="material-symbols-outlined mr-2 text-sm">
                                            delete
                                        </span>
                                        {t("treasury.budgets.actions.delete")}
                                    </Button>
                                    <ConfirmDialog
                                        open={showDeleteConfirm}
                                        onOpenChange={setShowDeleteConfirm}
                                        title={t("treasury.budgets.actions.delete")}
                                        description={t("treasury.budgets.delete_confirm")}
                                        confirmLabel={t("common.actions.delete")}
                                        cancelLabel={t("common.actions.cancel")}
                                        variant="destructive"
                                        onConfirm={() => {
                                            deleteFormRef.current?.requestSubmit();
                                            setShowDeleteConfirm(false);
                                        }}
                                    />
                                </>
                            )}
                        </div>
                    </TreasuryDetailCard>
                </div>
            </div>
        </PageWrapper>
    );
}
