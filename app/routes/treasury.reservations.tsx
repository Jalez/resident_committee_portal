import { Link, useSearchParams } from "react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    ContentArea,
    PageWrapper,
    SplitLayout,
} from "~/components/layout/page-layout";
import { MobileActionMenuWithItems } from "~/components/mobile-action-menu";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.reservations";

export function meta({ data }: Route.MetaArgs) {
    const year = data?.selectedYear ? ` ${data.selectedYear}` : "";
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - Rahastovaraukset${year} / Fund Reservations${year}`,
        },
        {
            name: "description",
            content: "Fund reservations management / Rahastovarauksien hallinta",
        },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    let permissions: string[];
    let languages: { primary: string; secondary: string };
    let userId: string | null = null;

    if (authUser) {
        permissions = authUser.permissions;
        languages = {
            primary: authUser.primaryLanguage,
            secondary: authUser.secondaryLanguage,
        };
        userId = authUser.userId;
    } else {
        const guestContext = await getGuestContext(() => getDatabase());
        permissions = guestContext.permissions;
        languages = guestContext.languages;
    }

    const canRead = permissions.some(
        (p) => p === "reservations:read" || p === "*",
    );
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

    const db = getDatabase();
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");

    // Get current year
    const currentRealYear = new Date().getFullYear();
    const selectedYear = yearParam ? Number.parseInt(yearParam, 10) : currentRealYear;

    // Get reservations for the year
    const reservations = await db.getFundReservationsByYear(selectedYear);

    // Calculate used amounts for each reservation
    const reservationsWithUsage = await Promise.all(
        reservations.map(async (reservation) => {
            const usedAmount = await db.getReservationUsedAmount(reservation.id);
            return {
                ...reservation,
                usedAmount,
                remainingAmount: Number.parseFloat(reservation.amount) - usedAmount,
            };
        }),
    );

    // Get all years with reservations for the dropdown
    const allReservations = await db.getFundReservations();
    const reservationYears = [...new Set(allReservations.map((r) => r.year))].sort(
        (a, b) => b - a,
    );

    // Add current year if not in the list
    if (!reservationYears.includes(currentRealYear)) {
        reservationYears.unshift(currentRealYear);
        reservationYears.sort((a, b) => b - a);
    }

    // Calculate totals
    const totalReserved = reservationsWithUsage
        .filter((r) => r.status === "open")
        .reduce((sum, r) => sum + Number.parseFloat(r.amount), 0);

    const totalUsed = reservationsWithUsage
        .filter((r) => r.status === "open")
        .reduce((sum, r) => sum + r.usedAmount, 0);

    // Get available funds
    const availableFunds = await db.getAvailableFundsForYear(selectedYear);

    return {
        siteConfig: SITE_CONFIG,
        selectedYear,
        reservations: reservationsWithUsage,
        years: reservationYears,
        totalReserved,
        totalUsed,
        availableFunds,
        languages,
        userId,
    };
}

export default function TreasuryReservations({
    loaderData,
}: Route.ComponentProps) {
    const {
        selectedYear,
        reservations,
        years,
        totalReserved,
        totalUsed,
        availableFunds,
        languages,
    } = loaderData;
    const { hasPermission } = useUser();
    const canWrite = hasPermission("reservations:write");
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    // Handle success/error toast messages
    useEffect(() => {
        const success = searchParams.get("success");
        if (success) {
            const successMessages: Record<string, string> = {
                created: "treasury.reservations.success.created",
                updated: "treasury.reservations.success.updated",
                deleted: "treasury.reservations.success.deleted",
                closed: "treasury.reservations.success.closed",
                reopened: "treasury.reservations.success.reopened",
            };
            toast.success(t(successMessages[success] || success));
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("success");
            setSearchParams(nextParams, { replace: true });
        }

        const error = searchParams.get("error");
        if (error) {
            const errorMessages: Record<string, string> = {
                has_transactions: "treasury.reservations.error.has_transactions",
                delete_failed: "treasury.reservations.error.delete_failed",
            };
            toast.error(t(errorMessages[error] || error));
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("error");
            setSearchParams(nextParams, { replace: true });
        }
    }, [searchParams, setSearchParams, t]);

    const formatCurrency = (value: number) => {
        return `${value.toFixed(2).replace(".", ",")} €`;
    };

    // Configure search fields
    const searchFields: SearchField[] = [
        {
            name: "year",
            label: t("treasury.reservations.year"),
            type: "select",
            placeholder: t("treasury.select_year"),
            options: years.map(String),
        },
    ];

    // Action items for the mobile action menu
    const actionItems = [
        {
            href: `/treasury?year=${selectedYear}`,
            icon: "arrow_back",
            labelPrimary: t("treasury.reservations.back", { lng: languages.primary }),
            labelSecondary: t("treasury.reservations.back", {
                lng: languages.secondary,
            }),
        },
        ...(canWrite
            ? [
                {
                    href: `/treasury/reservations/new?year=${selectedYear}`,
                    icon: "add",
                    labelPrimary: t("treasury.reservations.new", {
                        lng: languages.primary,
                    }),
                    labelSecondary: t("treasury.reservations.new", {
                        lng: languages.secondary,
                    }),
                },
            ]
            : []),
    ];

    const FooterContent = (
        <div className="flex items-center gap-2">
            <SearchMenu fields={searchFields} />
            <MobileActionMenuWithItems items={actionItems} />
        </div>
    );

    return (
        <PageWrapper>
            <SplitLayout
                footer={FooterContent}
                header={{
                    primary: t("treasury.reservations.title", { lng: languages.primary }),
                    secondary: t("treasury.reservations.title", {
                        lng: languages.secondary,
                    }),
                }}
            >
                <ContentArea className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>
                                    {t("treasury.reservations.available_funds")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p
                                    className={`text-2xl font-bold ${availableFunds >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                >
                                    {formatCurrency(availableFunds)}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>
                                    {t("treasury.reservations.reserved_funds")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                    {formatCurrency(totalReserved)}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="col-span-2 md:col-span-1">
                            <CardHeader className="pb-2">
                                <CardDescription>
                                    {t("treasury.reservations.used")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                                    {formatCurrency(totalUsed)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Reservations List */}
                    {reservations.length > 0 ? (
                        <div className="space-y-4">
                            {reservations.map((reservation) => (
                                <Card key={reservation.id}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <CardTitle className="text-lg">
                                                    {reservation.name}
                                                </CardTitle>
                                                {reservation.description && (
                                                    <CardDescription className="mt-1">
                                                        {reservation.description}
                                                    </CardDescription>
                                                )}
                                            </div>
                                            <Badge
                                                variant={
                                                    reservation.status === "open"
                                                        ? "default"
                                                        : "secondary"
                                                }
                                            >
                                                {t(
                                                    `treasury.reservations.statuses.${reservation.status}`,
                                                )}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                                    {t("treasury.reservations.amount")}
                                                </p>
                                                <p className="text-lg font-semibold">
                                                    {formatCurrency(Number.parseFloat(reservation.amount))}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                                    {t("treasury.reservations.used")}
                                                </p>
                                                <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                                                    {formatCurrency(reservation.usedAmount)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                                    {t("treasury.reservations.remaining")}
                                                </p>
                                                <p
                                                    className={`text-lg font-semibold ${reservation.remainingAmount > 0 ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}
                                                >
                                                    {formatCurrency(reservation.remainingAmount)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" asChild>
                                                <Link to={`/treasury/reservations/${reservation.id}`}>
                                                    <span className="material-symbols-outlined text-sm mr-1">
                                                        visibility
                                                    </span>
                                                    {t("treasury.reservations.actions.view")}
                                                </Link>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
                                savings
                            </span>
                            <p className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">
                                {t("treasury.reservations.no_reservations")}
                            </p>
                            <p className="text-gray-400 dark:text-gray-500 mb-6">
                                {t("treasury.reservations.no_reservations_desc", {
                                    year: selectedYear,
                                })}
                            </p>
                            {canWrite && (
                                <Button asChild>
                                    <Link to={`/treasury/reservations/new?year=${selectedYear}`}>
                                        <span className="material-symbols-outlined mr-2">add</span>
                                        {t("treasury.reservations.new")}
                                    </Link>
                                </Button>
                            )}
                        </div>
                    )}
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}
