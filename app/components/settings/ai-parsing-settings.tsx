import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
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
import { Switch } from "~/components/ui/switch";
import type { OpenRouterModel } from "~/lib/openrouter.server";
import { MissingApiKeyWarning } from "../missing-api-key-warning";

interface AiParsingSettingsProps {
	settings: {
		aiEnabled: boolean;
		aiModel: string;
		hasApiKey: boolean;
	};
	models: OpenRouterModel[];
}

export function AiParsingSettings({
	settings,
	models,
}: AiParsingSettingsProps) {
	const { t } = useTranslation();

	const [enabled, setEnabled] = useState(settings.aiEnabled);
	const [model, setModel] = useState(settings.aiModel);
	const [sortBy, setSortBy] = useState<"price" | "name">("price");
	const fetcher = useFetcher();

	useEffect(() => {
		if (fetcher.data) {
			if ("error" in fetcher.data) {
				toast.error(fetcher.data.error, { id: "ai-settings-error" });
			} else if ("message" in fetcher.data) {
				toast.success(fetcher.data.message, { id: "ai-settings-success" });
			}
		}
	}, [fetcher.data]);

	// Sync state with props
	useEffect(() => {
		setEnabled(settings.aiEnabled);
	}, [settings.aiEnabled]);

	useEffect(() => {
		setModel(settings.aiModel);
	}, [settings.aiModel]);

	// Sort models
	const sortedModels = [...models].sort((a, b) => {
		if (sortBy === "price") {
			return a.pricing.prompt - b.pricing.prompt;
		}
		return a.name.localeCompare(b.name);
	});

	const formatPrice = (price: number) => {
		if (price === 0) return t("common.fields.free");
		if (price < 0.01) return `$${price.toFixed(4)}`;
		return `$${price.toFixed(2)}`;
	};

	if (!settings.hasApiKey) {
		return <MissingApiKeyWarning />;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span className="material-symbols-outlined">smart_toy</span>
					{t("settings.reimbursements.ai_parsing_title")}
				</CardTitle>
				<CardDescription>
					{t("settings.reimbursements.ai_parsing_desc")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="save-ai-settings" />
					<input type="hidden" name="aiModel" value={model} />

					{!settings.hasApiKey && <MissingApiKeyWarning />}

					<div className="flex items-center justify-between space-x-2">
						<Label htmlFor="ai-enabled">
							{t("settings.reimbursements.enable_ai")}
						</Label>
						<Switch
							id="ai-enabled"
							name="aiEnabled"
							checked={enabled}
							onCheckedChange={setEnabled}
							disabled={!settings.hasApiKey}
						/>
					</div>

					{enabled && settings.hasApiKey && models.length > 0 && (
						<>
							<div className="flex items-center gap-2 mb-2">
								<Label>{t("common.actions.sort")}</Label>
								<Button
									type="button"
									variant={sortBy === "price" ? "default" : "outline"}
									size="sm"
									onClick={() => setSortBy("price")}
								>
									{t("common.fields.price")}
								</Button>
								<Button
									type="button"
									variant={sortBy === "name" ? "default" : "outline"}
									size="sm"
									onClick={() => setSortBy("name")}
								>
									{t("common.fields.name")}
								</Button>
							</div>

							<div className="space-y-2">
								<Label htmlFor="ai-model">
									{t("settings.reimbursements.select_model")}
								</Label>
								<Select value={model} onValueChange={setModel}>
									<SelectTrigger id="ai-model">
										<SelectValue
											placeholder={t(
												"settings.reimbursements.select_model_placeholder",
											)}
										/>
									</SelectTrigger>
									<SelectContent className="max-h-64">
										{sortedModels.slice(0, 50).map((m) => (
											<SelectItem key={m.id} value={m.id}>
												<div className="flex items-center gap-2">
													<span className="truncate max-w-[200px]">
														{m.name}
													</span>
													<Badge variant="secondary" className="text-xs">
														{formatPrice(m.pricing.prompt)}/1M
													</Badge>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									{t("settings.reimbursements.showing_models", {
										count: Math.min(50, sortedModels.length),
										total: sortedModels.length,
									})}
								</p>
							</div>
						</>
					)}

					<Button
						type="submit"
						disabled={fetcher.state !== "idle" || !settings.hasApiKey}
					>
						{fetcher.state === "idle"
							? t("common.actions.save")
							: t("common.status.saving")}
					</Button>
				</fetcher.Form>
			</CardContent>
		</Card>
	);
}
