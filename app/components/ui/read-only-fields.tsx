import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useTranslation } from "react-i18next";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

export type ReadOnlyFieldValue = string | number | boolean | null | undefined;



export interface ReadOnlyFieldsProps {
    fields: Record<string, ReadOnlyFieldValue>;
    translationNamespace?: string;
    title?: string;
    className?: string;
    columns?: number;
}

export function ReadOnlyFields({
    fields,
    translationNamespace,
    title,
    className,
    columns = 2,
}: ReadOnlyFieldsProps) {
    const { t } = useTranslation();

    if (Object.keys(fields).length === 0) return null;

    return (
        <Card>

            <CardContent>
                <div
                    className={cn(
                        "flex flex-row justify-between",

                    )}
                >
                    {Object.entries(fields).map(([key, value]) => {
                        if (value === null || value === undefined) return null;

                        // Handle boolean display if needed, or non-string
                        const displayValue = typeof value === "boolean" ? (value ? "Yes" : "No") : value;

                        const displayLabel = translationNamespace ? t(`${translationNamespace}.${key}`) : key;

                        return (
                            <div key={key}>
                                <Label className="text-muted-foreground">{displayLabel}</Label>
                                <div className="font-medium">{displayValue}</div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
