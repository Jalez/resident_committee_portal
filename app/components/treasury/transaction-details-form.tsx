import { useTranslation } from "react-i18next";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

// Category options for transactions with keys
export const EXPENSE_CATEGORIES = [
	{ value: "inventory", labelKey: "inventory" },
	{ value: "snacks", labelKey: "snacks" },
	{ value: "event", labelKey: "event" },
	{ value: "other", labelKey: "other" },
] as const;

export const INCOME_CATEGORIES = [
	{ value: "grant", labelKey: "grant" },
	{ value: "sales", labelKey: "sales" },
	{ value: "event_income", labelKey: "event_income" },
	{ value: "membership", labelKey: "membership" },
	{ value: "other", labelKey: "other" },
] as const;

export type TransactionType = "income" | "expense";
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]["value"];

export interface TransactionDetailsFormProps {
	/** Current transaction type */
	transactionType: TransactionType;
	/** Callback when type changes */
	onTypeChange: (type: TransactionType) => void;
	/** Current amount value */
	amount: string;
	/** Callback when amount changes */
	onAmountChange: (amount: string) => void;
	/** Current description value */
	description: string;
	/** Callback when description changes */
	onDescriptionChange: (description: string) => void;
	/** Current category value */
	category: string;
	/** Callback when category changes */
	onCategoryChange: (category: string) => void;
	/** Current date value (YYYY-MM-DD format) */
	date: string;
	/** Callback when date changes */
	onDateChange: (date: string) => void;
	/** Current year value */
	year: number;
	/** Callback when year changes */
	onYearChange?: (year: number) => void;
	/** Available year options */
	yearOptions: number[];
	/** Whether to disable type and year selectors (for edit mode) */
	disabled?: boolean;
	/** Whether to show the type selector (can be hidden when type is fixed) */
	showTypeSelector?: boolean;
	/** Whether to show year selector */
	showYearSelector?: boolean;
	/** Whether to wrap in a card container (default: true) */
	showCard?: boolean;
	/** Optional className for styling */
	className?: string;
}

/**
 * Reusable transaction details form component.
 * Handles type, amount, description, category, date, and year fields.
 * Used by both treasury/transactions/new and treasury/reimbursement/new.
 */
export function TransactionDetailsForm({
	transactionType,
	onTypeChange,
	amount,
	onAmountChange,
	description,
	onDescriptionChange,
	category,
	onCategoryChange,
	date,
	onDateChange,
	year,
	onYearChange,
	yearOptions,
	disabled = false,
	showTypeSelector = true,
	showYearSelector = true,
	showCard = true,
	className = "",
}: TransactionDetailsFormProps) {
	const { t } = useTranslation();

	// Update category options based on type
	const categoryOptions =
		transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

	const cardClasses = showCard
		? "bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4"
		: "space-y-4";

	return (
		<div className={`${cardClasses} ${className}`}>
			{showCard && (
				<h2 className="text-lg font-bold text-gray-900 dark:text-white">
					{t("treasury.new.details_header")}
				</h2>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{showTypeSelector && (
					<div className="space-y-2">
						<Label htmlFor="type">{t("common.fields.type")} *</Label>
						<Select
							name="type"
							value={transactionType}
							onValueChange={(val: TransactionType) => onTypeChange(val)}
							required
							disabled={disabled}
						>
							<SelectTrigger>
								<SelectValue placeholder={t("common.placeholders.select")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="income">
									<span className="flex items-center gap-2">
										<span className="text-green-600">+</span>
										{t("treasury.types.income")}
									</span>
								</SelectItem>
								<SelectItem value="expense">
									<span className="flex items-center gap-2">
										<span className="text-red-600">-</span>
										{t("treasury.types.expense")}
									</span>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				<div
					className={`space-y-2 ${!showTypeSelector ? "md:col-span-2" : ""}`}
				>
					<Label htmlFor="amount">{t("common.fields.amount")} *</Label>
					<Input
						id="amount"
						name="amount"
						type="number"
						step="0.01"
						min="0.01"
						required
						placeholder="0.00"
						value={amount}
						onChange={(e) => onAmountChange(e.target.value)}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="description">{t("common.fields.description")} *</Label>
				<Input
					id="description"
					name="description"
					required
					placeholder={t("treasury.form.description_placeholder")}
					value={description}
					onChange={(e) => onDescriptionChange(e.target.value)}
				/>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="category">{t("common.fields.category")} *</Label>
					<Select
						name="category"
						value={category}
						onValueChange={onCategoryChange}
						required
					>
						<SelectTrigger>
							<SelectValue placeholder={t("common.placeholders.select")} />
						</SelectTrigger>
						<SelectContent>
							{categoryOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{t(`treasury.categories.${opt.labelKey}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="date">{t("common.fields.date")} *</Label>
					<Input
						id="date"
						name="date"
						type="date"
						required
						value={date}
						onChange={(e) => onDateChange(e.target.value)}
					/>
				</div>
			</div>

			{showYearSelector && (
				<div className="space-y-2">
					<Label htmlFor="year">{t("common.fields.year")} *</Label>
					<Select
						name="year"
						value={year.toString()}
						onValueChange={(val) => onYearChange?.(parseInt(val, 10))}
						required
						disabled={disabled}
					>
						<SelectTrigger>
							<SelectValue placeholder={t("common.placeholders.select")} />
						</SelectTrigger>
						<SelectContent>
							{yearOptions.map((y) => (
								<SelectItem key={y} value={y.toString()}>
									{y}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		</div>
	);
}
