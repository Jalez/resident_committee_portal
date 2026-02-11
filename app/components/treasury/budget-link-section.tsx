import { useTranslation } from "react-i18next";
import { SectionCard } from "~/components/treasury/section-card";

type BudgetOption = {
	id: string;
	name: string;
	remainingAmount: number;
};

interface BudgetLinkSectionProps {
	openBudgets: BudgetOption[];
	selectedBudgetId: string;
	onSelectionChange: (id: string) => void;
	amount: string;
}

export function BudgetLinkSection({
	openBudgets,
	selectedBudgetId,
	onSelectionChange,
	amount,
}: BudgetLinkSectionProps) {
	const { t } = useTranslation();

	if (openBudgets.length === 0) {
		return null;
	}

	return (
		<SectionCard>
			<input type="hidden" name="budgetId" value={selectedBudgetId} />
			<input type="hidden" name="budgetAmount" value={amount} />

			<div className="space-y-3">
				<label className="text-base font-bold">
					{t("treasury.new.link_budget")}
				</label>
				<p className="text-sm text-gray-500 dark:text-gray-400">
					{t("treasury.new.link_budget_help")}
				</p>
				<select
					className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					value={selectedBudgetId || "none"}
					onChange={(event) =>
						onSelectionChange(
							event.target.value === "none" ? "" : event.target.value,
						)
					}
				>
					<option value="none">{t("treasury.new.no_budget")}</option>
					{openBudgets.map((budget) => (
						<option key={budget.id} value={budget.id}>
							{budget.name} - {t("treasury.budgets.remaining")}:{" "}
							{budget.remainingAmount.toFixed(2).replace(".", ",")} €
						</option>
					))}
				</select>
				{selectedBudgetId && (
					<p className="text-xs text-muted-foreground">
						{t("treasury.new.budget_note")}
					</p>
				)}
			</div>
		</SectionCard>
	);
}
