import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { MissingApiKeyWarning } from "~/components/missing-api-key-warning";
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
import type { OpenRouterModel } from "~/lib/openrouter.server";

interface AiTextAnalyzerSettingsProps {
	settings: {
		hasApiKey: boolean;
		analyticsModel: string;
	};
	models: OpenRouterModel[];
}

export function AiTextAnalyzerSettings({
	settings,
	models,
}: AiTextAnalyzerSettingsProps) {
	const [model, setModel] = useState(settings.analyticsModel);
	const [sortBy, setSortBy] = useState<"price" | "name">("price");
	const fetcher = useFetcher();

	useEffect(() => {
		if (fetcher.data) {
			if ("error" in fetcher.data) {
				toast.error(fetcher.data.error, { id: "analytics-settings-error" });
			} else if ("message" in fetcher.data) {
				toast.success(fetcher.data.message, {
					id: "analytics-settings-success",
				});
			}
		}
	}, [fetcher.data]);

	const sortedModels = useMemo(() => {
		return [...models].sort((a, b) => {
			if (sortBy === "price") {
				return a.pricing.prompt - b.pricing.prompt;
			}
			return a.name.localeCompare(b.name);
		});
	}, [models, sortBy]);

	const formatPrice = (price: number) => {
		if (price === 0) return "Free";
		if (price < 0.01) return `$${price.toFixed(4)}`;
		return `$${price.toFixed(2)}`;
	};

	if (!settings.hasApiKey) {
		return <MissingApiKeyWarning />;
	}

	return (
		<Card
			className={!settings.hasApiKey ? "opacity-50 pointer-events-none" : ""}
		>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span className="material-symbols-outlined">bar_chart</span>
					AI Analysis Model
				</CardTitle>
				<CardDescription>
					Select the AI model used for analyzing text responses and generating
					word clouds.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="save-analytics-settings" />
					<input type="hidden" name="analyticsModel" value={model} />

					{settings.hasApiKey && (
						<>
							{models.length > 0 && (
								<div className="flex items-center gap-2 mb-2">
									<Label>Sort models by</Label>
									<Button
										type="button"
										variant={sortBy === "price" ? "default" : "outline"}
										size="sm"
										onClick={() => setSortBy("price")}
									>
										Price
									</Button>
									<Button
										type="button"
										variant={sortBy === "name" ? "default" : "outline"}
										size="sm"
										onClick={() => setSortBy("name")}
									>
										Name
									</Button>
								</div>
							)}

							<div className="space-y-2">
								<Label>Select Model</Label>
								{models.length > 0 ? (
									<>
										<Select value={model} onValueChange={setModel}>
											<SelectTrigger>
												<SelectValue placeholder="Select a model..." />
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
											Showing top {Math.min(50, sortedModels.length)} models
										</p>
									</>
								) : (
									<p className="text-sm text-muted-foreground">
										Loading available models...
									</p>
								)}
							</div>
						</>
					)}

					<Button
						type="submit"
						disabled={fetcher.state !== "idle" || !settings.hasApiKey}
					>
						{fetcher.state === "idle" ? "Save Settings" : "Saving..."}
					</Button>
				</fetcher.Form>
			</CardContent>
		</Card>
	);
}
