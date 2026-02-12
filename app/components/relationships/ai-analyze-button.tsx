import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import type { RelationshipEntityType } from "~/db/types";

export interface AIAnalyzeButtonProps {
	/** The type of the source entity being analyzed */
	entityType: RelationshipEntityType;
	/** The ID of the source entity being analyzed */
	entityId: string;
	/** Optional callback when analysis completes successfully */
	onComplete?: (result: {
		success: boolean;
		createdCount: number;
		created: Array<{ type: string; id: string; name: string }>;
		errors?: string[];
	}) => void;
	/** Optional custom label (defaults to translated text) */
	label?: string;
	/** Button size variant */
	size?: "default" | "sm" | "lg" | "icon";
	/** Button style variant */
	variant?: "default" | "secondary" | "ghost" | "outline";
	/** Custom className */
	className?: string;
	/** Disabled state */
	disabled?: boolean;
}

/**
 * Button that triggers AI analysis of an entity to suggest related entities
 * Creates draft entities automatically and revalidates the page to show them
 */
export function AIAnalyzeButton({
	entityType,
	entityId,
	onComplete,
	label,
	size = "default",
	variant = "secondary",
	className,
	disabled = false,
}: AIAnalyzeButtonProps) {
	const { t } = useTranslation();
	const revalidator = useRevalidator();
	const [isAnalyzing, setIsAnalyzing] = useState(false);

	const handleAnalyze = async () => {
		if (isAnalyzing || disabled) return;

		setIsAnalyzing(true);
		const toastId = toast.loading(
			t("relationships.ai.analyzing", "Analyzing relationships..."),
		);

		try {
			const response = await fetch("/api/relationships/analyze", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					entityType,
					entityId,
				}),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.success) {
				toast.success(
					t(
						"relationships.ai.success",
						"Created {{count}} suggested relationships",
						{ count: result.createdCount },
					),
					{
						id: toastId,
						description: result.created
							.map((c: { name: string }) => `• ${c.name}`)
							.join("\n"),
					},
				);

				// Trigger page revalidation to show new draft entities
				revalidator.revalidate();

				onComplete?.(result);
			} else {
				toast.error(
					t("relationships.ai.error", "Failed to analyze relationships"),
					{
						id: toastId,
						description: result.errors?.join("\n"),
						action: {
							label: t("common.actions.retry", "Retry"),
							onClick: () => handleAnalyze(),
						},
					},
				);
			}
		} catch (error) {
			console.error("AI analysis error:", error);
			toast.error(
				t("relationships.ai.error", "Failed to analyze relationships"),
				{
					id: toastId,
					description: error instanceof Error ? error.message : String(error),
					action: {
						label: t("common.actions.retry", "Retry"),
						onClick: () => handleAnalyze(),
					},
				},
			);
		} finally {
			setIsAnalyzing(false);
		}
	};

	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			className={className}
			onClick={handleAnalyze}
			disabled={disabled || isAnalyzing}
		>
			<span className="material-symbols-outlined mr-2 text-lg">
				auto_awesome
			</span>
			{label || t("relationships.ai.analyze", "AI Analyze")}
		</Button>
	);
}
