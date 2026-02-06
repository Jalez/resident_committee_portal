import { useEffect } from "react";
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

interface LanguageSettingsProps {
    defaults: {
        primary: string;
        secondary: string | null;
    };
    supportedLanguages: string[];
    languageNames: Record<string, string>;
}

export function LanguageSettings({
    defaults,
    supportedLanguages,
    languageNames,
}: LanguageSettingsProps) {
    const { t } = useTranslation();
    const fetcher = useFetcher();

    useEffect(() => {
        if (fetcher.data) {
            if ("success" in fetcher.data && fetcher.data.success) {
                const msg =
                    "message" in fetcher.data && typeof fetcher.data.message === "string"
                        ? fetcher.data.message
                        : t("common.status.saved");
                toast.success(msg, { id: "language-settings-success" });
            } else if ("error" in fetcher.data) {
                toast.error(t("common.status.error"), { id: "language-settings-error" });
            }
        }
    }, [fetcher.data, t]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="material-symbols-outlined">language</span>
                    {t("settings.general.languages_title")}
                </CardTitle>
                <CardDescription>
                    {t("settings.general.languages_desc")}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <fetcher.Form method="post" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="primaryLanguage">
                                {t("settings.general.primary_language")}
                            </Label>
                            <Select name="primaryLanguage" defaultValue={defaults.primary}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {supportedLanguages.map((lang) => (
                                        <SelectItem key={lang} value={lang}>
                                            {languageNames[lang] || lang}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="secondaryLanguage">
                                {t("settings.general.secondary_language")}
                            </Label>
                            <Select
                                name="secondaryLanguage"
                                defaultValue={defaults.secondary || "none"}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {supportedLanguages.map((lang) => (
                                        <SelectItem key={lang} value={lang}>
                                            {languageNames[lang] || lang}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="none">{t("common.fields.none")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
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
