import { useState } from "react";
import { Form, redirect, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { TransactionsPicker } from "~/components/treasury/pickers/transactions-picker";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.budgets.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi budjetti / New Budget`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "treasury:budgets:write", getDatabase);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const selectedYear = yearParam
		? Number.parseInt(yearParam, 10)
		: currentYear;

	const availableFunds = await db.getAvailableFundsForYear(selectedYear);

	// Get transactions without budget links for this year
	const allTransactions = await db.getTransactionsByYear(selectedYear);
	const budgetTransactions = await Promise.all(
		allTransactions.map(async (t) => {
			const link = await db.getBudgetForTransaction(t.id);
			return link ? t.id : null;
		}),
	);
	const linkedTransactionIds = new Set(budgetTransactions.filter(Boolean));

	const unlinkedTransactions = allTransactions.filter(
		(t) => t.type === "expense" && !linkedTransactionIds.has(t.id),
	);

	return {
		siteConfig: SITE_CONFIG,
		selectedYear,
		availableFunds,
		unlinkedTransactions,
	};
}

const createBudgetSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
	year: z.coerce.number().int().min(2000).max(2100),
});

export async function action({ request }: Route.ActionArgs) {
	const authUser = await requirePermission(
		request,
		"treasury:budgets:write",
		getDatabase,
	);

	const formData = await request.formData();
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const amountStr = formData.get("amount") as string;
	const year = Number.parseInt(formData.get("year") as string, 10);
	const transactionId = formData.get("transactionId") as string;

	const result = createBudgetSchema.safeParse({
		name,
		description,
		amount: amountStr,
		year,
	});

	if (!result.success) {
		return {
			error: "Validation failed",
			fieldErrors: result.error.flatten().fieldErrors,
		};
	}

	const amount = Number.parseFloat(amountStr.replace(",", "."));

	const db = getDatabase();
	const availableFunds = await db.getAvailableFundsForYear(year);

	if (amount > availableFunds) {
		return {
			error: "insufficient_funds",
			availableFunds,
		};
	}

	const budget = await db.createFundBudget({
		name,
		description: description || null,
		amount: amount.toFixed(2),
		year,
		status: "open",
		createdBy: authUser.userId,
	});

	if (transactionId) {
		const tx = (await db.getAllTransactions()).find((t) => t.id === transactionId);
		if (tx) {
			await db.linkTransactionToBudget(tx.id, budget.id, tx.amount);
		}
	}

	return redirect(`/treasury/budgets?year=${year}&success=created`);
}

export default function TreasuryBudgetsNew({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { selectedYear, availableFunds, unlinkedTransactions } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [selectedTransactionId, setSelectedTransactionId] = useState("");
	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.budgets.new")} />

				{actionData?.error === "insufficient_funds" && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
						{t("treasury.budgets.insufficient_funds", {
							available: formatCurrency(
								actionData.availableFunds as number,
							),
						})}
					</div>
				)}

				<Form method="post" className="space-y-6">
					<input type="hidden" name="year" value={selectedYear} />
					<input type="hidden" name="transactionId" value={selectedTransactionId} />

					<TreasuryDetailCard title={t("treasury.budgets.new")}>
						<div className="grid gap-4">
							<TreasuryField
								mode="edit"
								label={t("treasury.budgets.name")}
								name="name"
								type="text"
								value={name}
								onChange={setName}
								required
								placeholder={t(
									"treasury.budgets.name_placeholder",
								)}
							/>
							<TreasuryField
								mode="edit"
								label={t("treasury.budgets.description")}
								name="description"
								type="textarea"
								value={description}
								onChange={setDescription}
								placeholder={t(
									"treasury.budgets.description_placeholder",
								)}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.budgets.amount")} (€)`}
								name="amount"
								type="currency"
								value={amount}
								onChange={setAmount}
								required
							/>
							<TreasuryField label={t("treasury.budgets.year")}>
								{selectedYear}
							</TreasuryField>
							<TreasuryField
								label={t("treasury.budgets.available_funds")}
								valueClassName={
									availableFunds >= 0
										? "text-green-600 dark:text-green-400 font-medium"
										: "text-red-600 dark:text-red-400 font-medium"
								}
							>
								{formatCurrency(availableFunds)}
							</TreasuryField>
						</div>

						<TransactionsPicker
							unlinkedTransactions={unlinkedTransactions}
							selectedTransactionIds={selectedTransactionId}
							onSelectionChange={(ids) =>
								setSelectedTransactionId(Array.isArray(ids) ? ids[0] : ids)
							}
							createUrl={`/treasury/transactions/new?year=${selectedYear}&type=expense`}
							currentPath={`/treasury/budgets/new`}
							storageKey={`new-budget-transactions`}
							label={t("treasury.budgets.linked_transactions")}
						/>
					</TreasuryDetailCard>

					<TreasuryFormActions
						saveLabel={t("treasury.budgets.form.create")}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
