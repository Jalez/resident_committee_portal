import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { useUser } from "~/contexts/user-context";
import { translateWithOllama } from "~/lib/ollama-client";
import { cn } from "~/lib/utils";

interface TranslateFieldButtonProps {
	/** The model to use for translation (from LocalModelSelector) */
	model: string | null;
	/** ID of the source input element to read from */
	sourceInputId: string;
	/** ID of the target input element to write to */
	targetInputId: string;
	/** Source language name (e.g., "Finnish") */
	sourceLanguage: string;
	/** Target language name (e.g., "English") */
	targetLanguage: string;
	/** Optional class name */
	className?: string;
	/** Direction indicator */
	direction?: "forward" | "reverse";
}

export function TranslateFieldButton({
	model,
	sourceInputId,
	targetInputId,
	sourceLanguage,
	targetLanguage,
	className,
	direction = "forward",
}: TranslateFieldButtonProps) {
	const { user } = useUser();
	const { t } = useTranslation();
	const [translating, setTranslating] = useState(false);

	// Don't render if user hasn't enabled local AI or no model selected
	if (!user?.localOllamaEnabled || !model) {
		return null;
	}

	const ollamaUrl = user.localOllamaUrl;

	const handleTranslate = async () => {
		const sourceInput = document.getElementById(sourceInputId) as
			| HTMLInputElement
			| HTMLTextAreaElement
			| null;
		const targetInput = document.getElementById(targetInputId) as
			| HTMLInputElement
			| HTMLTextAreaElement
			| null;

		if (!sourceInput || !targetInput) {
			toast.error(t("local_ai.translate.input_not_found"));
			return;
		}

		const sourceText = sourceInput.value.trim();
		if (!sourceText) {
			toast.error(t("local_ai.translate.empty_source"));
			return;
		}

		setTranslating(true);
		try {
			const translated = await translateWithOllama(
				ollamaUrl,
				model,
				sourceText,
				sourceLanguage,
				targetLanguage,
			);

			// Set the value and trigger React's onChange if needed
			targetInput.value = translated;
			// Dispatch input event to trigger React state updates
			targetInput.dispatchEvent(new Event("input", { bubbles: true }));

			toast.success(t("local_ai.translate.success"));
		} catch (error) {
			console.error("Translation failed:", error);
			toast.error(
				t("local_ai.translate.failed", {
					error: error instanceof Error ? error.message : "Unknown error",
				}),
			);
		} finally {
			setTranslating(false);
		}
	};

	const tooltipText = t("local_ai.translate.button_tooltip", {
		source: sourceLanguage,
		target: targetLanguage,
	});

	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleTranslate}
						disabled={translating}
						className={cn(
							"h-8 w-8 p-0 text-gray-500 hover:text-primary hover:bg-primary/10",
							className,
						)}
					>
						{translating ? (
							<span className="material-symbols-outlined text-lg animate-spin">
								progress_activity
							</span>
						) : (
							<span className="material-symbols-outlined text-lg">
								{direction === "forward" ? "translate" : "swap_horiz"}
							</span>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">
					<div className="flex items-center gap-1.5">
						<span className="material-symbols-outlined text-sm">smart_toy</span>
						<span>{tooltipText}</span>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

/**
 * A row of translate buttons for primary <-> secondary language fields
 */
interface TranslateFieldRowProps {
	model: string | null;
	primaryInputId: string;
	secondaryInputId: string;
	primaryLanguage: string;
	secondaryLanguage: string;
	className?: string;
}

export function TranslateFieldRow({
	model,
	primaryInputId,
	secondaryInputId,
	primaryLanguage,
	secondaryLanguage,
	className,
}: TranslateFieldRowProps) {
	const { user } = useUser();

	// Don't render if user hasn't enabled local AI or no model selected
	if (!user?.localOllamaEnabled || !model) {
		return null;
	}

	return (
		<div className={cn("flex items-center gap-1", className)}>
			<TranslateFieldButton
				model={model}
				sourceInputId={primaryInputId}
				targetInputId={secondaryInputId}
				sourceLanguage={primaryLanguage}
				targetLanguage={secondaryLanguage}
				direction="forward"
			/>
			<TranslateFieldButton
				model={model}
				sourceInputId={secondaryInputId}
				targetInputId={primaryInputId}
				sourceLanguage={secondaryLanguage}
				targetLanguage={primaryLanguage}
				direction="reverse"
			/>
		</div>
	);
}
