import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { toast } from "sonner";
import { SettingsPageLayout } from "~/components/layout/settings-page-layout";
import { ReceiptOCRSettings } from "~/components/settings/receipt-ocr-settings";
import {
	action,
	loader,
} from "~/components/settings/receipt-ocr-settings.server";
import type { Route } from "./+types/_index";

export { loader, action };

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: "Portal - Receipt OCR Settings",
		},
	];
}

export default function SettingsReceipts({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const actionData = useActionData<{ success?: boolean; error?: string }>();

	useEffect(() => {
		if (!actionData) return;
		if (actionData.error) {
			toast.error(actionData.error);
			return;
		}
		if (actionData.success) {
			toast.success(
				t("settings.save_success", {
					defaultValue: "Settings saved",
				}),
			);
		}
	}, [actionData, t]);

	return (
		<SettingsPageLayout
			title={t("settings.receipt_ocr_title", {
				defaultValue: "Receipt OCR",
			})}
			description={t("settings.receipt_ocr_description", {
				defaultValue: "Configure AI settings for automatic receipt parsing.",
			})}
		>
			{loaderData ? (
				<ReceiptOCRSettings
					apiKey={loaderData.apiKey}
					currentModel={loaderData.currentModel}
					models={loaderData.models}
				/>
			) : null}
		</SettingsPageLayout>
	);
}
