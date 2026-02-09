import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
    TREASURY_BUDGET_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";
import {
    TreasuryDetailCard,
    TreasuryField,
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
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import type { AnyEntity } from "~/lib/entity-converters";
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

    // Load relationships using universal system
    const relationships = await loadRelationshipsForEntity(
        db,
        "budget",
        budget.id,
        ["transaction"],
    );

    return {
        siteConfig: SITE_CONFIG,
        budget,
        relationships,
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
        relationships,
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

                        <RelationshipPicker
                            relationAType="budget"
                            relationAId={budget.id}
                            relationAName={budget.name || ""}
                            mode="view"
                            sections={[
                                {
                                    relationBType: "transaction",
                                    linkedEntities: (relationships.transaction?.linked || []) as unknown as AnyEntity[],
                                    availableEntities: [],
                                },
                            ]}
                        />

                        <Separator />
                        <div className="flex gap-2">
                            {canDelete && (relationships.transaction?.linked.length || 0) === 0 && (
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
