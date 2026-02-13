import { useTranslation } from "react-i18next";
import { Form } from "react-router";
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

interface AutoInputAISettingsProps {
	apiKey: string;
	currentModel: string;
	models: Array<{ id: string; name: string }>;
}

export function AutoInputAISettings({
	apiKey,
	currentModel,
	models,
}: AutoInputAISettingsProps) {
	const { t } = useTranslation();

	if (!apiKey) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<span className="material-symbols-outlined">auto_awesome</span>
						{t("settings.auto_input.ai_title", "AI Auto-Fill")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						{t(
							"settings.auto_input.no_api_key",
							"Please configure your OpenRouter API key in General Settings first.",
						)}
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Form method="post" className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<span className="material-symbols-outlined">auto_awesome</span>
						{t("settings.auto_input.ai_title", "AI Auto-Fill Model")}
					</CardTitle>
					<CardDescription>
						{t(
							"settings.auto_input.description",
							"Configure the AI model used for auto-filling form fields based on relationship context. This analyzes linked entities (receipts, reimbursements, transactions) to suggest values for empty fields.",
						)}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="modelId">
							{t("settings.auto_input.model", "AI Model")}
						</Label>
						<Select name="modelId" defaultValue={currentModel}>
							<SelectTrigger>
								<SelectValue placeholder="Select a model..." />
							</SelectTrigger>
							<SelectContent>
								{models.length > 0 ? (
									models.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											{model.name}
										</SelectItem>
									))
								) : (
									<SelectItem value={currentModel}>{currentModel}</SelectItem>
								)}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{t(
								"settings.auto_input.model_help",
								"This model analyzes linked entity data to suggest categories, descriptions, and other field values. Claude models generally work best for this task.",
							)}
						</p>
					</div>

					<Button type="submit">{t("common.actions.save", "Save")}</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>
						{t("settings.auto_input.how_it_works", "How It Works")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3 text-sm text-muted-foreground">
						<p>
							{t(
								"settings.auto_input.info_1",
								"When you create or edit entities like transactions, reimbursements, or inventory items, the system can auto-fill empty fields based on linked data.",
							)}
						</p>
						<p>
							{t(
								"settings.auto_input.info_2",
								"For example, when creating a transaction from a receipt, the AI analyzes the receipt content to suggest appropriate categories and descriptions.",
							)}
						</p>
						<p>
							{t(
								"settings.auto_input.info_3",
								"Values are only suggested for empty fields - existing data is never overwritten.",
							)}
						</p>
						<div className="pt-2">
							<p className="font-medium text-foreground">
								{t("settings.auto_input.sources", "Data Sources:")}
							</p>
							<ul className="list-disc list-inside mt-1 space-y-1 ml-2">
								<li>
									{t(
										"settings.auto_input.source_receipt",
										"Receipts - OCR data, line items, totals",
									)}
								</li>
								<li>
									{t(
										"settings.auto_input.source_reimbursement",
										"Reimbursements - Amounts, descriptions",
									)}
								</li>
								<li>
									{t(
										"settings.auto_input.source_transaction",
										"Transactions - Categories, dates",
									)}
								</li>
								<li>
									{t(
										"settings.auto_input.source_inventory",
										"Inventory - Values, purchase dates",
									)}
								</li>
							</ul>
						</div>
					</div>
				</CardContent>
			</Card>
		</Form>
	);
}
