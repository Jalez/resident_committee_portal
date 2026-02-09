import { Form } from "react-router";
import { useTranslation } from "react-i18next";
import { TreasuryDetailCard } from "../treasury/treasury-detail-components";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

interface SourceContextAISettingsProps {
	apiKey: string;
	currentModel: string;
	models: Array<{ id: string; name: string }>;
}

export function SourceContextAISettings({
	apiKey,
	currentModel,
	models,
}: SourceContextAISettingsProps) {
	const { t } = useTranslation();

	if (!apiKey) {
		return (
			<TreasuryDetailCard title={t("settings.source_context_ai.title", "Source Context AI")}>
				<div className="text-sm text-gray-600 dark:text-gray-400">
					{t("settings.source_context_ai.no_api_key",
						"Please configure your OpenRouter API key in General Settings first."
					)}
				</div>
			</TreasuryDetailCard>
		);
	}

	return (
		<Form method="post" className="space-y-6">
			<TreasuryDetailCard title={t("settings.source_context_ai.title", "Source Context AI")}>
				<div className="space-y-4">
					<div>
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
							{t("settings.source_context_ai.description",
								"Configure which AI model to use for analyzing receipt content and suggesting transaction categories when auto-filling from source context."
							)}
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="modelId">
							{t("settings.source_context_ai.model", "AI Model")}
						</Label>
						<select
							id="modelId"
							name="modelId"
							defaultValue={currentModel}
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
							required
						>
							{models.length > 0 ? (
								models.map((model) => (
									<option key={model.id} value={model.id}>
										{model.name}
									</option>
								))
							) : (
								<option value={currentModel}>{currentModel}</option>
							)}
						</select>
						<p className="text-xs text-gray-500 dark:text-gray-400">
							{t("settings.source_context_ai.model_help",
								"This model will analyze receipt content to suggest appropriate transaction categories. Claude models generally work best for this task."
							)}
						</p>
					</div>

					<div className="pt-4">
						<Button type="submit" variant="default">
							{t("common.actions.save", "Save")}
						</Button>
					</div>
				</div>
			</TreasuryDetailCard>

			<TreasuryDetailCard title={t("settings.source_context_ai.how_it_works", "How It Works")}>
				<div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
					<p>
						{t("settings.source_context_ai.info_1",
							"When you create a new transaction from a reimbursement request or receipt, the system automatically analyzes the receipt content using AI."
						)}
					</p>
					<p>
						{t("settings.source_context_ai.info_2",
							"The AI looks at the store name, items purchased, and total amount to suggest the most appropriate transaction category (e.g., inventory, office supplies, food, equipment)."
						)}
					</p>
					<p>
						{t("settings.source_context_ai.info_3",
							"This helps ensure consistent categorization and reduces manual data entry."
						)}
					</p>
					<div className="pt-2">
						<p className="font-medium text-gray-700 dark:text-gray-300">
							{t("settings.source_context_ai.categories", "Available Categories:")}
						</p>
						<ul className="list-disc list-inside mt-1 space-y-1 ml-2">
							<li>{t("settings.source_context_ai.cat_inventory", "Inventory - Items for resale")}</li>
							<li>{t("settings.source_context_ai.cat_office", "Office Supplies - Paper, pens, etc.")}</li>
							<li>{t("settings.source_context_ai.cat_travel", "Travel - Transportation, accommodation")}</li>
							<li>{t("settings.source_context_ai.cat_food", "Food - Meals, catering")}</li>
							<li>{t("settings.source_context_ai.cat_equipment", "Equipment - Tools, furniture")}</li>
							<li>{t("settings.source_context_ai.cat_marketing", "Marketing - Advertising, promotional")}</li>
							<li>{t("settings.source_context_ai.cat_software", "Software - Licenses, subscriptions")}</li>
							<li>{t("settings.source_context_ai.cat_utilities", "Utilities - Electricity, internet, phone")}</li>
							<li>{t("settings.source_context_ai.cat_rent", "Rent - Facility costs")}</li>
							<li>{t("settings.source_context_ai.cat_other", "Other - Everything else")}</li>
						</ul>
					</div>
				</div>
			</TreasuryDetailCard>
		</Form>
	);
}
