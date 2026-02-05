import { Form, Link, redirect, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
    ContentArea,
    PageWrapper,
    SplitLayout,
} from "~/components/layout/page-layout";
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
    requirePermissionOrSelf,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.reservations.$reservationId";

export function meta({ data }: Route.MetaArgs) {
    const name = data?.reservation?.name || "Reservation";
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - ${name}`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    await requirePermission(request, "reservations:read", getDatabase);
    const authUser = await getAuthenticatedUser(request, getDatabase);

    const db = getDatabase();
    const reservation = await db.getFundReservationById(params.reservationId);

    if (!reservation) {
        throw new Response("Not Found", { status: 404 });
    }

    // Get linked transactions
    const linkedTransactions = await db.getReservationTransactions(
        reservation.id,
    );
    const usedAmount = await db.getReservationUsedAmount(reservation.id);

    // Get creator info - we'll just show "Unknown" if we can't get the user
    const createdByName = reservation.createdBy ? "—" : null;

    return {
        siteConfig: SITE_CONFIG,
        reservation: {
            ...reservation,
            usedAmount,
            remainingAmount: Number.parseFloat(reservation.amount) - usedAmount,
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
    const reservation = await db.getFundReservationById(params.reservationId);

    if (!reservation) {
        throw new Response("Not Found", { status: 404 });
    }

    const formData = await request.formData();
    const actionType = formData.get("_action");

    if (actionType === "delete") {
        // Check delete permission
        await requireDeletePermissionOrSelf(
            request,
            "reservations:delete",
            "reservations:delete-self",
            reservation.createdBy,
            getDatabase,
        );

        const deleted = await db.deleteFundReservation(params.reservationId);
        if (!deleted) {
            return redirect(
                `/treasury/reservations/${params.reservationId}?error=has_transactions`,
            );
        }

        return redirect(`/treasury/reservations?year=${reservation.year}&success=deleted`);
    }

    if (actionType === "close") {
        await requirePermissionOrSelf(
            request,
            "reservations:update",
            "reservations:update-self",
            reservation.createdBy,
            getDatabase,
        );

        await db.updateFundReservation(params.reservationId, { status: "closed" });
        return redirect(
            `/treasury/reservations/${params.reservationId}?success=closed`,
        );
    }

    if (actionType === "reopen") {
        await requirePermissionOrSelf(
            request,
            "reservations:update",
            "reservations:update-self",
            reservation.createdBy,
            getDatabase,
        );

        await db.updateFundReservation(params.reservationId, { status: "open" });
        return redirect(
            `/treasury/reservations/${params.reservationId}?success=reopened`,
        );
    }

    return null;
}

export default function TreasuryReservationsView({
    loaderData,
}: Route.ComponentProps) {
    const {
        reservation,
        linkedTransactions,
        createdByName,
        languages,
        currentUserId,
    } = loaderData;
    const { t, i18n } = useTranslation();
    const { hasPermission } = useUser();
    const navigate = useNavigate();

    // Permissions
    const canUpdate =
        hasPermission("reservations:update") ||
        (hasPermission("reservations:update-self") &&
            reservation.createdBy === currentUserId);
    const canDelete =
        hasPermission("reservations:delete") ||
        (hasPermission("reservations:delete-self") &&
            reservation.createdBy === currentUserId);

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
                    primary: t("treasury.reservations.view.title", {
                        lng: languages.primary,
                    }),
                    secondary: t("treasury.reservations.view.title", {
                        lng: languages.secondary,
                    }),
                }}
            >
                <ContentArea className="space-y-6">
                    {/* Main info card */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="text-2xl">{reservation.name}</CardTitle>
                                    {reservation.description && (
                                        <CardDescription className="mt-2">
                                            {reservation.description}
                                        </CardDescription>
                                    )}
                                </div>
                                <Badge
                                    variant={
                                        reservation.status === "open" ? "default" : "secondary"
                                    }
                                >
                                    {t(`treasury.reservations.statuses.${reservation.status}`)}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Amounts */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                        {t("treasury.reservations.amount")}
                                    </p>
                                    <p className="text-2xl font-bold">
                                        {formatCurrency(Number.parseFloat(reservation.amount))}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                        {t("treasury.reservations.used")}
                                    </p>
                                    <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                                        {formatCurrency(reservation.usedAmount)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                        {t("treasury.reservations.remaining")}
                                    </p>
                                    <p
                                        className={`text-2xl font-bold ${reservation.remainingAmount > 0 ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}
                                    >
                                        {formatCurrency(reservation.remainingAmount)}
                                    </p>
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">
                                        {t("treasury.reservations.year")}
                                    </p>
                                    <p className="font-medium">{reservation.year}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">
                                        {t("treasury.reservations.created_by")}
                                    </p>
                                    <p className="font-medium">{createdByName || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">
                                        {t("treasury.reservations.created_at")}
                                    </p>
                                    <p className="font-medium">
                                        {formatDate(reservation.createdAt)}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-4 border-t">
                                {canUpdate && (
                                    <>
                                        <Button variant="outline" asChild>
                                            <Link
                                                to={`/treasury/reservations/${reservation.id}/edit`}
                                            >
                                                <span className="material-symbols-outlined mr-2 text-sm">
                                                    edit
                                                </span>
                                                {t("treasury.reservations.actions.edit")}
                                            </Link>
                                        </Button>

                                        {reservation.status === "open" ? (
                                            <Form method="post">
                                                <input type="hidden" name="_action" value="close" />
                                                <Button
                                                    type="submit"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                        const remaining = formatCurrency(
                                                            reservation.remainingAmount,
                                                        );
                                                        if (
                                                            !confirm(
                                                                t("treasury.reservations.close_confirm", {
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
                                                    {t("treasury.reservations.actions.close")}
                                                </Button>
                                            </Form>
                                        ) : (
                                            <Form method="post">
                                                <input type="hidden" name="_action" value="reopen" />
                                                <Button
                                                    type="submit"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                        if (
                                                            !confirm(
                                                                t("treasury.reservations.reopen_confirm"),
                                                            )
                                                        ) {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined mr-2 text-sm">
                                                        lock_open
                                                    </span>
                                                    {t("treasury.reservations.actions.reopen")}
                                                </Button>
                                            </Form>
                                        )}
                                    </>
                                )}

                                {canDelete && linkedTransactions.length === 0 && (
                                    <Form method="post">
                                        <input type="hidden" name="_action" value="delete" />
                                        <Button
                                            type="submit"
                                            variant="destructive"
                                            onClick={(e) => {
                                                if (
                                                    !confirm(t("treasury.reservations.delete_confirm"))
                                                ) {
                                                    e.preventDefault();
                                                }
                                            }}
                                        >
                                            <span className="material-symbols-outlined mr-2 text-sm">
                                                delete
                                            </span>
                                            {t("treasury.reservations.actions.delete")}
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
                                {t("treasury.reservations.linked_transactions")}
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
                                    {t("treasury.reservations.no_transactions")}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
