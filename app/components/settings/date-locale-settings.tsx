import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { getDateLocaleString } from "~/lib/format-utils";

const DATE_LOCALE_OPTIONS = [
    { value: "fi", label: "Suomi (Finnish)", example: "fi-FI" },
    { value: "sv", label: "Svenska (Swedish)", example: "sv-SE" },
    { value: "en-GB", label: "English (UK)", example: "en-GB" },
    { value: "en-US", label: "English (US)", example: "en-US" },
];

interface DateLocaleSettingsProps {
    currentLocale: string;
}

export function DateLocaleSettings({ currentLocale }: DateLocaleSettingsProps) {
    const { t } = useTranslation();
    const fetcher = useFetcher();
    const [selectedLocale, setSelectedLocale] = useState(currentLocale);

    useEffect(() => {
        if (fetcher.data) {
            if ("success" in fetcher.data && fetcher.data.success) {
                toast.success(t("common.status.saved"), {
                    id: "date-locale-settings-success",
                });
            } else if ("error" in fetcher.data) {
                toast.error(t("common.status.error"), {
                    id: "date-locale-settings-error",
                });
            }
        }
    }, [fetcher.data, t]);

    const previewDate = new Date(2026, 0, 12); // Jan 12, 2026
    const previewFormatted = previewDate.toLocaleDateString(
        getDateLocaleString(selectedLocale),
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="material-symbols-outlined">calendar_month</span>
                    {t("settings.general.date_locale_title", "Date Format")}
                </CardTitle>
                <CardDescription>
                    {t(
                        "settings.general.date_locale_desc",
                        "Choose how dates are displayed throughout the application",
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <fetcher.Form method="post" className="space-y-4">
                    <input type="hidden" name="intent" value="save-date-locale" />

                    <div className="space-y-2">
                        <Label htmlFor="dateLocale">
                            {t("settings.general.date_locale_label", "Date locale")}
                        </Label>
                        <Select
                            name="dateLocale"
                            value={selectedLocale}
                            onValueChange={setSelectedLocale}
                        >
                            <SelectTrigger className="w-full max-w-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DATE_LOCALE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">
                            {t("settings.general.date_locale_preview", "Preview")}:{" "}
                        </span>
                        <span className="font-medium">{previewFormatted}</span>
                        <span className="text-muted-foreground ml-2">
                            (12.1.2026 = {t("settings.general.date_locale_preview_hint", "January 12, 2026")})
                        </span>
                    </div>

                    <Button type="submit" disabled={fetcher.state !== "idle"}>
                        {fetcher.state === "idle"
                            ? t("common.actions.save")
                            : t("common.status.saving")}
                    </Button>
                </fetcher.Form>
            </CardContent>
        </Card>
    );
}
