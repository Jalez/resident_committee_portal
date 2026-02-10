import { useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { toast } from "sonner";
import type { RelationshipEntityType } from "~/db/schema";
import type { SmartAutofillSuggestions } from "~/routes/api.entities.smart-autofill";

export interface SmartAutofillButtonProps {
	/** Entity type being edited */
	entityType: RelationshipEntityType;
	/** Entity ID being edited */
	entityId: string;
	/** Current form values (to determine which fields need filling) */
	getCurrentValues: () => Record<string, string>;
	/** Callback when suggestions are available — apply them to the form */
	onSuggestions: (suggestions: Record<string, string | number | null>) => void;
	/** Whether to include AI analysis (slower, costs API credits) */
	useAI?: boolean;
	/** Button variant */
	variant?: "default" | "outline" | "ghost" | "secondary";
	/** Button size */
	size?: "default" | "sm" | "lg" | "icon";
}

/**
 * Smart Autofill button that fetches relationship context and optionally AI suggestions.
 * Placed in the PageHeader of edit routes.
 */
export function SmartAutofillButton({
	entityType,
	entityId,
	getCurrentValues,
	onSuggestions,
	useAI = false,
	variant = "outline",
	size = "sm",
}: SmartAutofillButtonProps) {
	const { t } = useTranslation();
	const fetcher = useFetcher<SmartAutofillSuggestions>();
	const [applied, setApplied] = useState(false);

	const isLoading = fetcher.state !== "idle";

	const handleClick = () => {
		setApplied(false);
		const currentValues = getCurrentValues();

		const formData = new FormData();
		formData.append("entityType", entityType);
		formData.append("entityId", entityId);
		formData.append("useAI", String(useAI));
		formData.append("currentValues", JSON.stringify(currentValues));

		fetcher.submit(formData, {
			method: "POST",
			action: "/api/entities/smart-autofill",
		});
	};

	// Handle response
	if (fetcher.data && fetcher.state === "idle" && !applied) {
		const suggestions = fetcher.data.suggestions;
		const count = Object.keys(suggestions).length;

		if (count > 0) {
			onSuggestions(suggestions);
			setApplied(true);
			toast.success(
				t("smart_autofill.applied", {
					count,
					defaultValue: "{{count}} field(s) auto-filled",
				}),
				{
					description: fetcher.data.ai?.reasoning || undefined,
				},
			);
		} else {
			setApplied(true);
			toast.info(
				t("smart_autofill.no_suggestions", {
					defaultValue: "No autofill suggestions available",
				}),
			);
		}
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={variant}
						size={size}
						onClick={handleClick}
						disabled={isLoading}
						className="gap-1.5"
					>
						{isLoading ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : applied ? (
							<Check className="w-4 h-4 text-green-500" />
						) : (
							<Sparkles className="w-4 h-4" />
						)}
						{t("smart_autofill.button", { defaultValue: "Smart Autofill" })}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>
						{useAI
							? t("smart_autofill.tooltip_ai", {
									defaultValue: "Fill fields from linked entities + AI suggestions",
								})
							: t("smart_autofill.tooltip", {
									defaultValue: "Fill fields from linked entities",
								})}
					</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
