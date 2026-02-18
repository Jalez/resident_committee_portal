import { Check, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { useUser } from "~/contexts/user-context";
import type { RelationshipEntityType } from "~/db/types";
import { fetchOllamaModels, type OllamaModel } from "~/lib/ollama-client";
import { cn } from "~/lib/utils";
import type { SmartAutofillSuggestions } from "~/routes/api/entities/smart-autofill/_index";

const LOCAL_MODEL_STORAGE_KEY = "local-ollama-model";
const EXPAND_RELATIONS_STORAGE_KEY = "smart-autofill-expand-relations";

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
	/** Controlled local model selection */
	localModel?: string | null;
	/** Callback when local model changes */
	onLocalModelChange?: (model: string | null) => void;
	/** Source language for translation/autofill */
	sourceLanguage?: string;
	/** Target language for translation/autofill */
	targetLanguage?: string;
	/** Additional fields to send with autofill request (e.g. pending relationship changes) */
	getExtraFormData?: () => Record<string, string>;
	/** Show icon-only on mobile widths */
	iconOnlyOnMobile?: boolean;
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
	localModel: propLocalModel,
	onLocalModelChange,
	sourceLanguage,
	targetLanguage,
	getExtraFormData,
	iconOnlyOnMobile = false,
}: SmartAutofillButtonProps) {
	const { t } = useTranslation();
	const { user } = useUser();
	const fetcher = useFetcher<SmartAutofillSuggestions>();
	const [applied, setApplied] = useState(false);

	// Local model selection logic
	const [models, setModels] = useState<OllamaModel[]>([]);
	const [internalSelectedModel, setInternalSelectedModel] = useState<
		string | null
	>(null);
	const [loadingModels, setLoadingModels] = useState(false);
	const [expandRelatedRelations, setExpandRelatedRelations] =
		useState<boolean>(() => {
			if (typeof window === "undefined") return true;
			const raw = localStorage.getItem(EXPAND_RELATIONS_STORAGE_KEY);
			return raw == null ? true : raw === "true";
		});

	const selectedModel =
		propLocalModel !== undefined ? propLocalModel : internalSelectedModel;

	const isLoading = fetcher.state !== "idle";
	const isLocalEnabled = user?.localOllamaEnabled;

	useEffect(() => {
		if (!isLocalEnabled) return;

		async function loadModels() {
			setLoadingModels(true);
			try {
				const fetchedModels = await fetchOllamaModels(
					user?.localOllamaUrl || "",
				);
				setModels(fetchedModels);

				if (propLocalModel === undefined) {
					const savedModel = localStorage.getItem(LOCAL_MODEL_STORAGE_KEY);
					if (savedModel && fetchedModels.some((m) => m.name === savedModel)) {
						setInternalSelectedModel(savedModel);
						onLocalModelChange?.(savedModel);
					} else if (fetchedModels.length > 0) {
						const firstModel = fetchedModels[0].name;
						setInternalSelectedModel(firstModel);
						onLocalModelChange?.(firstModel);
					}
				}
			} catch (err) {
				console.error("Failed to load local models:", err);
			} finally {
				setLoadingModels(false);
			}
		}

		loadModels();
	}, [
		isLocalEnabled,
		user?.localOllamaUrl,
		propLocalModel,
		onLocalModelChange,
	]);

	const handleModelChange = (model: string) => {
		const newValue = model === "none" ? null : model;
		if (propLocalModel === undefined) {
			setInternalSelectedModel(newValue);
		}
		if (newValue === null) {
			localStorage.removeItem(LOCAL_MODEL_STORAGE_KEY);
		} else {
			localStorage.setItem(LOCAL_MODEL_STORAGE_KEY, newValue);
		}
		onLocalModelChange?.(newValue);
	};

	const handleClick = () => {
		setApplied(false);
		const currentValues = getCurrentValues();

		const formData = new FormData();
		formData.append("entityType", entityType);
		formData.append("entityId", entityId);
		formData.append("useAI", String(useAI));
		formData.append("localModel", selectedModel || "");
		formData.append(
			"expandLinkedRelations",
			String(expandRelatedRelations),
		);
		formData.append("currentValues", JSON.stringify(currentValues));
		if (currentValues._relationship_links) {
			formData.append("_relationship_links", currentValues._relationship_links);
		}
		if (currentValues._relationship_unlinks) {
			formData.append(
				"_relationship_unlinks",
				currentValues._relationship_unlinks,
			);
		}
		if (sourceLanguage) formData.append("sourceLanguage", sourceLanguage);
		if (targetLanguage) formData.append("targetLanguage", targetLanguage);
		if (getExtraFormData) {
			const extra = getExtraFormData();
			for (const [key, value] of Object.entries(extra)) {
				formData.append(key, value);
			}
		}

		fetcher.submit(formData, {
			method: "POST",
			action: "/api/entities/smart-autofill",
		});
	};

	const handleExpandRelationsToggle = (checked: boolean) => {
		setExpandRelatedRelations(checked);
		localStorage.setItem(EXPAND_RELATIONS_STORAGE_KEY, String(checked));
	};

	// Handle response
	// biome-ignore lint/correctness/useExhaustiveDependencies: handle response on mount and data change
	useEffect(() => {
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
	}, [fetcher.data, fetcher.state, applied, onSuggestions, t]);

	const hasOptionsMenu = true;

	return (
		<div className="flex items-center min-w-0 sm:shrink">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant={variant}
							size={size}
							onClick={handleClick}
							disabled={isLoading}
							className={cn(
								"gap-1.5",
								iconOnlyOnMobile &&
									"h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:gap-1.5 sm:max-w-[9rem] md:max-w-[11rem] lg:max-w-[12rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0",
								hasOptionsMenu && "rounded-r-none border-r-0",
							)}
						>
							{isLoading ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : applied ? (
								<Check className="w-4 h-4 text-green-500" />
							) : (
								<Sparkles className="w-4 h-4" />
							)}
							<span
								className={
									iconOnlyOnMobile
										? "hidden sm:inline sm:truncate max-w-full"
										: ""
								}
							>
								{t("smart_autofill.button", { defaultValue: "Smart Autofill" })}
							</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{useAI
								? t("smart_autofill.tooltip_ai", {
										defaultValue:
											"Fill fields from linked entities + AI suggestions",
									})
								: t("smart_autofill.tooltip", {
										defaultValue: "Fill fields from linked entities",
									})}
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			{hasOptionsMenu && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant={variant}
							size="icon"
							disabled={loadingModels}
							className={cn(
								"w-8 px-0 rounded-l-none border-l-gray-200 dark:border-l-gray-700",
								iconOnlyOnMobile
									? "h-10 w-10 p-0 sm:w-8"
									: size === "sm"
										? "h-8"
										: "h-9",
								iconOnlyOnMobile &&
									(size === "sm" ? "sm:h-8" : "sm:h-9"),
							)}
						>
							<ChevronDown className="w-4 h-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-[260px]">
						<DropdownMenuLabel>
							{t("smart_autofill.options", { defaultValue: "Autofill options" })}
						</DropdownMenuLabel>
						<DropdownMenuCheckboxItem
							checked={expandRelatedRelations}
							onCheckedChange={(checked) =>
								handleExpandRelationsToggle(Boolean(checked))
							}
						>
							{t("smart_autofill.expand_relations", {
								defaultValue: "Also link relations of linked items",
							})}
						</DropdownMenuCheckboxItem>
						{isLocalEnabled && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuLabel>
									{t("local_ai.model_selector.title", {
										defaultValue: "Local model",
									})}
								</DropdownMenuLabel>
								<DropdownMenuRadioGroup
									value={selectedModel || "none"}
									onValueChange={handleModelChange}
								>
									<DropdownMenuRadioItem value="none">
										<span className="text-gray-500">
											{t("local_ai.model_selector.disabled", {
												defaultValue: "Disabled",
											})}
										</span>
									</DropdownMenuRadioItem>
									{models.map((model) => (
										<DropdownMenuRadioItem key={model.name} value={model.name}>
											{model.name}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
