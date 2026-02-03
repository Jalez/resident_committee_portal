import { Form, Link, redirect, useNavigate } from "react-router";
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
import type { Route } from "./+types/treasury.reservations.$reservationId.edit";

export function meta({ data }: Route.MetaArgs) {
    const name = data?.reservation?.name || "Reservation";
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - ${name} Edit`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    const db = getDatabase();
    const reservation = await db.getFundReservationById(params.reservationId);

    if (!reservation) {
        throw new Response("Not Found", { status: 404 });
    }

    // Check permission
    await requirePermissionOrSelf(
        request,
        "reservations:update",
        "reservations:update-self",
        reservation.createdBy,
        getDatabase,
    );

    const authUser = await getAuthenticatedUser(request, getDatabase);

    // Get used amount to prevent reducing below it
    const usedAmount = await db.getReservationUsedAmount(reservation.id);

    // Get available funds
    const availableFunds = await db.getAvailableFundsForYear(reservation.year);

    return {
        siteConfig: SITE_CONFIG,
        reservation: {
            ...reservation,
            usedAmount,
        },
        availableFunds,
        languages: {
            primary: authUser?.primaryLanguage || "fi",
            secondary: authUser?.secondaryLanguage || "en",
        },
    };
}

const updateReservationSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
});

export async function action({ request, params }: Route.ActionArgs) {
    const db = getDatabase();
    const reservation = await db.getFundReservationById(params.reservationId);

    if (!reservation) {
        throw new Response("Not Found", { status: 404 });
    }

    // Check permission
    await requirePermissionOrSelf(
        request,
        "reservations:update",
        "reservations:update-self",
        reservation.createdBy,
        getDatabase,
    );

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const amountStr = formData.get("amount") as string;

    // Validate
    const result = updateReservationSchema.safeParse({
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
    const usedAmount = await db.getReservationUsedAmount(params.reservationId);

    // Cannot reduce below used amount
    if (newAmount < usedAmount) {
        return {
            error: "cannot_reduce",
            usedAmount,
        };
    }

    // Check available funds if increasing
    const currentAmount = Number.parseFloat(reservation.amount);
    if (newAmount > currentAmount) {
        const increase = newAmount - currentAmount;
        const availableFunds = await db.getAvailableFundsForYear(reservation.year);

        if (increase > availableFunds) {
            return {
                error: "insufficient_funds",
                availableFunds,
            };
        }
    }

    // Update reservation
    await db.updateFundReservation(params.reservationId, {
        name,
        description: description || null,
        amount: newAmount.toFixed(2),
    });

    return redirect(
        `/treasury/reservations/${params.reservationId}?success=updated`,
    );
}

export default function TreasuryReservationsEdit({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const { reservation, availableFunds, languages } = loaderData;
    const { t } = useTranslation();
    const navigate = useNavigate();

    const formatCurrency = (value: number) => {
        return `${value.toFixed(2).replace(".", ",")} €`;
    };

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: t("treasury.reservations.edit.title", {
                        lng: languages.primary,
                    }),
                    secondary: t("treasury.reservations.edit.title", {
                        lng: languages.secondary,
                    }),
                }}
            >
                <ContentArea>
                    {/* Back link */}
                    <Link
                        to={`/treasury/reservations/${reservation.id}`}
                        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-4"
                    >
                        <span className="material-symbols-outlined text-base">
                            arrow_back
                        </span>
                        {t("treasury.reservations.back")}
                    </Link>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("treasury.reservations.edit.title")}</CardTitle>
                            <CardDescription>
                                {t("treasury.reservations.available_funds")}:{" "}
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
                                {t("treasury.reservations.used")}:{" "}
                                <span className="text-gray-600 dark:text-gray-400">
                                    {formatCurrency(reservation.usedAmount)}
                                </span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                {actionData?.error === "insufficient_funds" && (
                                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
                                        {t("treasury.reservations.insufficient_funds", {
                                            available: formatCurrency(
                                                actionData.availableFunds as number,
                                            ),
                                        })}
                                    </div>
                                )}

                                {actionData?.error === "cannot_reduce" && (
                                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
                                        {t("treasury.reservations.cannot_reduce", {
                                            used: formatCurrency(actionData.usedAmount as number),
                                        })}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="name">{t("treasury.reservations.name")}</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        defaultValue={reservation.name}
                                        placeholder={t("treasury.reservations.name_placeholder")}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">
                                        {t("treasury.reservations.description")}
                                    </Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        defaultValue={reservation.description || ""}
                                        placeholder={t(
                                            "treasury.reservations.description_placeholder",
                                        )}
                                        rows={3}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="amount">
                                        {t("treasury.reservations.amount")} (€)
                                    </Label>
                                    <Input
                                        id="amount"
                                        name="amount"
                                        type="text"
                                        inputMode="decimal"
                                        defaultValue={Number.parseFloat(reservation.amount)
                                            .toFixed(2)
                                            .replace(".", ",")}
                                        placeholder="0,00"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {t("treasury.reservations.cannot_reduce", {
                                            used: formatCurrency(reservation.usedAmount),
                                        }).replace("Cannot reduce amount below used amount", "Minimum")}
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <Button type="submit">
                                        {t("treasury.reservations.form.save")}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            navigate(`/treasury/reservations/${reservation.id}`)
                                        }
                                    >
                                        {t("treasury.reservations.form.cancel")}
                                    </Button>
                                </div>
                            </Form>
                        </CardContent>
                    </Card>
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
