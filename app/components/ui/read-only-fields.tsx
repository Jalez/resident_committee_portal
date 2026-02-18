import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
						"grid gap-4",
						columns > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
					)}
				>
					{Object.entries(fields).map(([key, value]) => {
						if (value === null || value === undefined) return null;

						// Handle boolean display if needed, or non-string
						const displayValue =
							typeof value === "boolean" ? (value ? "Yes" : "No") : value;

						const displayLabel =
							key === "id"
								? "ID"
								: translationNamespace
									? t(`${translationNamespace}.${key}`)
									: key;

						return (
							<div key={key} className="min-w-0">
								<Label className="text-muted-foreground">{displayLabel}</Label>
								<div className="font-medium break-all">{displayValue}</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
