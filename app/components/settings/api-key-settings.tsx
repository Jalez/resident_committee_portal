import { useEffect, useState } from "react";
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
import { Input } from "~/components/ui/input";

interface ApiKeySettingsProps {
	apiKey: string;
	hasApiKey: boolean;
}

export function ApiKeySettings({
	apiKey: serverApiKey,
	hasApiKey,
}: ApiKeySettingsProps) {
	const { t } = useTranslation();
	const [apiKey, setApiKey] = useState(serverApiKey);
	const fetcher = useFetcher();
	const deleteFetcher = useFetcher();

	useEffect(() => {
		if (fetcher.data) {
			if ("success" in fetcher.data && fetcher.data.success) {
				const msg =
					"message" in fetcher.data && typeof fetcher.data.message === "string"
						? fetcher.data.message
						: t("common.status.saved");
				toast.success(msg, { id: "api-key-settings-success" });
			} else if ("error" in fetcher.data) {
				toast.error(fetcher.data.error || t("common.status.error"), {
					id: "api-key-settings-error",
				});
			}
		}
		if (deleteFetcher.data) {
			if ("success" in deleteFetcher.data && deleteFetcher.data.success) {
				toast.success(t("common.actions.deleted"), {
					id: "api-key-delete-success",
				});
			} else if ("error" in deleteFetcher.data) {
				toast.error(deleteFetcher.data.error || t("common.status.error"), {
					id: "api-key-delete-error",
				});
			}
		}
	}, [fetcher.data, deleteFetcher.data, t]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span className="material-symbols-outlined">key</span>
					OpenRouter API Key
				</CardTitle>
				<CardDescription>
					Required for AI features (Parsing, Analytics)
				</CardDescription>
			</CardHeader>
			<CardContent>
				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="save-api-key" />
					<div className="flex gap-2">
						<Input
							name="apiKey"
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="sk-or-v1-..."
							className="font-mono"
						/>
						<Button type="submit" disabled={fetcher.state !== "idle"}>
							{fetcher.state === "idle"
								? t("common.actions.save")
								: t("common.status.saving")}
						</Button>
						{hasApiKey && (
							<deleteFetcher.Form method="post">
								<input type="hidden" name="intent" value="delete-api-key" />
								<Button
									type="submit"
									variant="destructive"
									disabled={deleteFetcher.state !== "idle"}
								>
									{deleteFetcher.state === "idle"
										? t("common.actions.delete")
										: t("common.status.deleting")}
								</Button>
							</deleteFetcher.Form>
						)}
					</div>
				</fetcher.Form>
			</CardContent>
		</Card>
	);
}
