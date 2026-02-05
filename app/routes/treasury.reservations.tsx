import { Link, useSearchParams } from "react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import {
    PageWrapper,
    SplitLayout,
} from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TableTotalsRow } from "~/components/treasury/table-totals-row";
import { Badge } from "~/components/ui/badge";
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
    const statusParam = url.searchParams.get("status") || "all";

    // Get current year
    const currentRealYear = new Date().getFullYear();
    const selectedYear = yearParam ? Number.parseInt(yearParam, 10) : currentRealYear;

    // Get reservations for the year
    let reservations = await db.getFundReservationsByYear(selectedYear);

    // Filter by status if specified
    if (statusParam !== "all") {
        reservations = reservations.filter((r) => r.status === statusParam);
    }

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

    // Get unique statuses for SearchMenu
    const uniqueStatuses = [...new Set(allReservations.map((r) => r.status))];

    return {
        siteConfig: SITE_CONFIG,
        selectedYear,
        reservations: reservationsWithUsage,
        years: reservationYears,
        statuses: uniqueStatuses,
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
        statuses,
        languages,
    } = loaderData;
    const { hasPermission } = useUser();
    const canWrite = hasPermission("reservations:write");
    const { t, i18n } = useTranslation();
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

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString(
            i18n.language === "fi" ? "fi-FI" : "en-US",
        );
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
        {
            name: "status",
            label: t("common.fields.status"),
            type: "select",
            placeholder: t("common.actions.all"),
            options: ["all", ...statuses],
        },
    ];

    const FooterContent = (
        <div className="flex items-center gap-2">
            <SearchMenu fields={searchFields} />
            {canWrite && (
                <AddItemButton
                    to={`/treasury/reservations/new?year=${selectedYear}`}
                    title={t("treasury.reservations.new")}
                    variant="icon"
                />
            )}
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
                <div className="space-y-6">
                    {/* Reservations Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {reservations.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4 block">
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
                                    <AddItemButton
                                        to={`/treasury/reservations/new?year=${selectedYear}`}
                                        title={t("treasury.reservations.new")}
                                        variant="button"
                                    />
                                )}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">#</TableHead>
                                        <TableHead>{t("treasury.reservations.name")}</TableHead>
                                        <TableHead>{t("treasury.reservations.used")}</TableHead>
                                        <TableHead>{t("treasury.reservations.remaining")}</TableHead>
                                        <TableHead>{t("common.fields.status")}</TableHead>
                                        <TableHead>{t("common.fields.date")}</TableHead>
                                        <TableHead className="text-right">{t("treasury.reservations.amount")}</TableHead>
                                        <TableHead className="w-16"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reservations.map((reservation, index) => (
                                        <TableRow key={reservation.id}>
                                            <TableCell className="text-gray-500 dark:text-gray-400 text-sm font-mono">
                                                {index + 1}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">
                                                        {reservation.name}
                                                    </p>
                                                    {reservation.description && (
                                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                            {reservation.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-gray-600 dark:text-gray-400">
                                                {formatCurrency(reservation.usedAmount)}
                                            </TableCell>
                                            <TableCell
                                                className={`font-semibold ${
                                                    reservation.remainingAmount > 0
                                                        ? "text-green-600 dark:text-green-400"
                                                        : "text-gray-500"
                                                }`}
                                            >
                                                {formatCurrency(reservation.remainingAmount)}
                                            </TableCell>
                                            <TableCell>
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
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {formatDate(reservation.createdAt)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {formatCurrency(Number.parseFloat(reservation.amount))}
                                            </TableCell>
                                            <TableCell>
                                                <Link
                                                    to={`/treasury/reservations/${reservation.id}`}
                                                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                                >
                                                    <span className="material-symbols-outlined text-base">
                                                        visibility
                                                    </span>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableTotalsRow
                                        labelColSpan={2}
                                        columns={[
                                            {
                                                value: reservations.reduce((sum, r) => sum + r.usedAmount, 0),
                                            },
                                            {
                                                value: reservations.reduce((sum, r) => sum + r.remainingAmount, 0),
                                            },
                                            {
                                                value: reservations.reduce((sum, r) => sum + Number.parseFloat(r.amount), 0),
                                            },
                                        ]}
                                        middleColSpan={2}
                                        trailingColSpan={1}
                                        formatCurrency={formatCurrency}
                                        rowCount={reservations.length}
                                    />
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}
