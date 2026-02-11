import { useState } from "react";
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

interface DraftCleanupSettingsProps {
	className?: string;
}

export function DraftCleanupSettings({ className }: DraftCleanupSettingsProps) {
	const { t } = useTranslation();
	const fetcher = useFetcher<{
		success?: boolean;
		totalDeleted?: number;
		error?: string;
	}>();
	const [isRunning, setIsRunning] = useState(false);

	const handleCleanup = async () => {
		setIsRunning(true);
		const toastId = toast.loading(
			t("relationships.draft.cleanup_running", {
				defaultValue: "Cleaning up orphaned drafts...",
			}),
		);

		fetcher.submit(
			{},
			{
				method: "POST",
				action: "/api/drafts/cleanup",
			},
		);

		// Wait for the response
		const checkResponse = setInterval(() => {
			if (fetcher.state === "idle" && fetcher.data) {
				clearInterval(checkResponse);
				setIsRunning(false);

				if (fetcher.data.success && fetcher.data.totalDeleted !== undefined) {
					toast.success(
						t("relationships.draft.cleanup_success", {
							defaultValue: "Deleted {{count}} orphaned draft(s)",
							count: fetcher.data.totalDeleted,
						}),
						{ id: toastId },
					);
				} else if (fetcher.data.error) {
					toast.error(
						t("relationships.draft.cleanup_error", {
							defaultValue: "Cleanup failed: {{error}}",
							error: fetcher.data.error,
						}),
						{ id: toastId },
					);
				}
			}
		}, 100);

		// Timeout after 30 seconds
		setTimeout(() => {
			clearInterval(checkResponse);
			setIsRunning(false);
		}, 30000);
	};

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>
					{t("settings.draft_cleanup.title", {
						defaultValue: "Draft Cleanup",
					})}
				</CardTitle>
				<CardDescription>
					{t("settings.draft_cleanup.description", {
						defaultValue:
							"Remove orphaned draft entities that have no relationships and are older than 24 hours. This also deletes associated files from storage.",
					})}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					onClick={handleCleanup}
					disabled={isRunning || fetcher.state !== "idle"}
					variant="destructive"
					type="button"
				>
					<span className="material-symbols-outlined mr-2 text-base">
						delete_sweep
					</span>
					{isRunning
						? t("relationships.draft.cleanup_running", {
								defaultValue: "Cleaning...",
							})
						: t("relationships.draft.cleanup", {
								defaultValue: "Clean Up Drafts",
							})}
				</Button>
				<p className="mt-2 text-sm text-muted-foreground">
					{t("settings.draft_cleanup.warning", {
						defaultValue:
							"Warning: This action cannot be undone. Only drafts without any relationships will be deleted.",
					})}
				</p>
			</CardContent>
		</Card>
	);
}
