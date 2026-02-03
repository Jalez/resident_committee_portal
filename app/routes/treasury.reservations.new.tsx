import { Form, redirect, useNavigate, useSearchParams } from "react-router";
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
import { requirePermission, getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.reservations.new";

export function meta({ data }: Route.MetaArgs) {
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - Uusi varaus / New Reservation`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "reservations:write", getDatabase);

    const authUser = await getAuthenticatedUser(request, getDatabase);

    const db = getDatabase();
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const currentYear = new Date().getFullYear();
    const selectedYear = yearParam ? Number.parseInt(yearParam, 10) : currentYear;

    // Get available funds for validation
    const availableFunds = await db.getAvailableFundsForYear(selectedYear);

    return {
        siteConfig: SITE_CONFIG,
        selectedYear,
        availableFunds,
        languages: {
            primary: authUser?.primaryLanguage || "fi",
            secondary: authUser?.secondaryLanguage || "en",
        },
    };
}

const createReservationSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
    year: z.coerce.number().int().min(2000).max(2100),
});

export async function action({ request }: Route.ActionArgs) {
    const authUser = await requirePermission(
        request,
        "reservations:write",
        getDatabase,
    );

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const amountStr = formData.get("amount") as string;
    const year = Number.parseInt(formData.get("year") as string, 10);

    // Validate
    const result = createReservationSchema.safeParse({
        name,
        description,
        amount: amountStr,
        year,
    });

    if (!result.success) {
        return { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors };
    }

    // Parse amount
    const amount = Number.parseFloat(amountStr.replace(",", "."));

    // Check available funds
    const db = getDatabase();
    const availableFunds = await db.getAvailableFundsForYear(year);

    if (amount > availableFunds) {
        return {
            error: "insufficient_funds",
            availableFunds,
        };
    }

    // Create reservation
    await db.createFundReservation({
        name,
        description: description || null,
        amount: amount.toFixed(2),
        year,
        status: "open",
        createdBy: authUser?.userId || null,
    });

    return redirect(`/treasury/reservations?year=${year}&success=created`);
}

export default function TreasuryReservationsNew({
    loaderData,
    actionData,
}: Route.ComponentProps) {
    const { selectedYear, availableFunds, languages } = loaderData;
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const formatCurrency = (value: number) => {
        return `${value.toFixed(2).replace(".", ",")} €`;
    };

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: t("treasury.reservations.new", { lng: languages.primary }),
                    secondary: t("treasury.reservations.new", {
                        lng: languages.secondary,
                    }),
                }}
            >
                <ContentArea>
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("treasury.reservations.new")}</CardTitle>
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
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                <input type="hidden" name="year" value={selectedYear} />

                                {actionData?.error === "insufficient_funds" && (
                                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
                                        {t("treasury.reservations.insufficient_funds", {
                                            available: formatCurrency(
                                                actionData.availableFunds as number,
                                            ),
                                        })}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="name">{t("treasury.reservations.name")}</Label>
                                    <Input
                                        id="name"
                                        name="name"
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
                                        placeholder="0,00"
                                        required
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <Button type="submit">
                                        {t("treasury.reservations.form.create")}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            navigate(
                                                `/treasury/reservations?year=${selectedYear}`,
                                            )
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
