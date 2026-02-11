import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useUser } from "~/contexts/user-context";
import { fetchOllamaModels, type OllamaModel } from "~/lib/ollama-client";
import { cn } from "~/lib/utils";

const LOCAL_MODEL_STORAGE_KEY = "local-ollama-model";

interface LocalModelSelectorProps {
	onModelChange?: (model: string | null) => void;
	className?: string;
}

export function LocalModelSelector({
	onModelChange,
	className,
}: LocalModelSelectorProps) {
	const { user } = useUser();
	const { t } = useTranslation();
	const [models, setModels] = useState<OllamaModel[]>([]);
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [connectionStatus, setConnectionStatus] = useState<
		"connecting" | "connected" | "error"
	>("connecting");

	// Don't render if user hasn't enabled local AI
	if (!user?.localOllamaEnabled) {
		return null;
	}

	const ollamaUrl = user.localOllamaUrl;

	// Load models on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: only fetch on mount and url change
	useEffect(() => {
		async function loadModels() {
			setLoading(true);
			setError(null);
			setConnectionStatus("connecting");
			try {
				const fetchedModels = await fetchOllamaModels(ollamaUrl);
				setModels(fetchedModels);
				setConnectionStatus("connected");

				// Restore last selected model from localStorage
				const savedModel = localStorage.getItem(LOCAL_MODEL_STORAGE_KEY);
				if (savedModel && fetchedModels.some((m) => m.name === savedModel)) {
					setSelectedModel(savedModel);
					onModelChange?.(savedModel);
				} else if (fetchedModels.length > 0) {
					// Default to first model if no saved selection
					const firstModel = fetchedModels[0].name;
					setSelectedModel(firstModel);
					onModelChange?.(firstModel);
				}
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: t("profile.local_ai.connection_error"),
				);
				setConnectionStatus("error");
				onModelChange?.(null);
			} finally {
				setLoading(false);
			}
		}

		loadModels();
	}, [ollamaUrl]);

	const handleModelChange = (model: string) => {
		if (model === "none") {
			setSelectedModel(null);
			localStorage.removeItem(LOCAL_MODEL_STORAGE_KEY);
			onModelChange?.(null);
		} else {
			setSelectedModel(model);
			localStorage.setItem(LOCAL_MODEL_STORAGE_KEY, model);
			onModelChange?.(model);
		}
	};

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3",
				className,
			)}
		>
			{/* Connection status indicator */}
			<div className="flex items-center gap-2">
				<div
					className={cn(
						"w-2 h-2 rounded-full",
						connectionStatus === "connecting" && "bg-yellow-400 animate-pulse",
						connectionStatus === "connected" && "bg-green-500",
						connectionStatus === "error" && "bg-red-500",
					)}
				/>
				<span className="material-symbols-outlined text-lg text-gray-500">
					smart_toy
				</span>
			</div>

			{/* Label */}
			<span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
				{t("local_ai.model_selector.label")}
			</span>

			{/* Model selector or status */}
			{loading ? (
				<div className="flex items-center gap-2 text-sm text-gray-500">
					<span className="material-symbols-outlined animate-spin text-base">
						progress_activity
					</span>
					{t("local_ai.model_selector.loading")}
				</div>
			) : error ? (
				<div className="flex items-center gap-2 text-sm text-red-500">
					<span className="material-symbols-outlined text-base">error</span>
					{t("local_ai.model_selector.connection_failed")}
				</div>
			) : models.length === 0 ? (
				<span className="text-sm text-amber-600 dark:text-amber-400">
					{t("local_ai.model_selector.no_models")}
				</span>
			) : (
				<Select
					value={selectedModel || "none"}
					onValueChange={handleModelChange}
				>
					<SelectTrigger className="w-[200px] bg-white dark:bg-gray-800">
						<SelectValue
							placeholder={t("local_ai.model_selector.select_model")}
						/>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">
							<span className="text-gray-500">
								{t("local_ai.model_selector.disabled")}
							</span>
						</SelectItem>
						{models.map((model) => (
							<SelectItem key={model.name} value={model.name}>
								{model.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{/* Model count indicator */}
			{connectionStatus === "connected" && models.length > 0 && (
				<span className="text-xs text-gray-400 ml-auto">
					{t("local_ai.model_selector.model_count", { count: models.length })}
				</span>
			)}
		</div>
	);
}

/**
 * Hook to use the selected local model in a component
 */
export function useLocalModel() {
	const [selectedModel, setSelectedModel] = useState<string | null>(null);

	// Load from localStorage on mount
	useEffect(() => {
		const saved = localStorage.getItem(LOCAL_MODEL_STORAGE_KEY);
		if (saved) {
			setSelectedModel(saved);
		}
	}, []);

	return {
		selectedModel,
		setSelectedModel,
	};
}
