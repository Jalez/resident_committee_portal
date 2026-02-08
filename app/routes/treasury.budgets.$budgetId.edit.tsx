import { useRef, useState } from "react";
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
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { getDatabase } from "~/db";
import {
	requirePermissionOrSelf,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.budgets.$budgetId.edit";

export function meta({ data }: Route.MetaArgs) {
	const name = data?.budget?.name || "Budget";
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${name} Edit`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();
	const budget = await db.getFundBudgetById(params.budgetId);

	if (!budget) {
		throw new Response("Not Found", { status: 404 });
	}

	await requirePermissionOrSelf(
		request,
		"treasury:budgets:update",
		"treasury:budgets:update-self",
		budget.createdBy,
		getDatabase,
	);

	const usedAmount = await db.getBudgetUsedAmount(budget.id);
	const availableFunds = await db.getAvailableFundsForYear(budget.year);

	// Get currently linked transactions
	const linkedBudgetTransactions = await db.getBudgetTransactions(budget.id);
	const linkedTransactions = linkedBudgetTransactions.map(l => l.transaction);

	// Get unlinked transactions for this year
	const allTransactions = await db.getTransactionsByYear(budget.year);
	const allBudgetTransactions = await Promise.all(
		allTransactions.map(async (t) => {
			const link = await db.getBudgetForTransaction(t.id);
			return link ? t.id : null;
		}),
	);
	const linkedTransactionIds = new Set(allBudgetTransactions.filter(Boolean));

	const unlinkedTransactions = allTransactions.filter(
		(t) => t.type === "expense" && !linkedTransactionIds.has(t.id),
	);

	return {
		siteConfig: SITE_CONFIG,
		budget: {
			...budget,
			usedAmount,
			remainingAmount: Number.parseFloat(budget.amount) - usedAmount,
		},
		availableFunds,
		linkedTransactions,
		unlinkedTransactions,
	};
}

const updateBudgetSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
});

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();
	const budget = await db.getFundBudgetById(params.budgetId);

	if (!budget) {
		throw new Response("Not Found", { status: 404 });
	}

	await requirePermissionOrSelf(
		request,
		"treasury:budgets:update",
		"treasury:budgets:update-self",
		budget.createdBy,
		getDatabase,
	);

	const formData = await request.formData();
	const actionType = formData.get("_action") as string | null;
	const transactionIdsJson = formData.get("transactionIds") as string;
	const selectedTransactionIds = transactionIdsJson ? JSON.parse(transactionIdsJson) as string[] : [];

	if (actionType === "close") {
		await db.updateFundBudget(params.budgetId, { status: "closed" });
		return redirect(
			`/treasury/budgets/${params.budgetId}?success=closed`,
		);
	}

	if (actionType === "reopen") {
		await db.updateFundBudget(params.budgetId, { status: "open" });
		return redirect(
			`/treasury/budgets/${params.budgetId}?success=reopened`,
		);
	}

	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const amountStr = formData.get("amount") as string;

	const result = updateBudgetSchema.safeParse({
		name,
		description,
		amount: amountStr,
	});

	if (!result.success) {
		return {
			error: "Validation failed",
			fieldErrors: result.error.flatten().fieldErrors,
		};
	}

	const newAmount = Number.parseFloat(amountStr.replace(",", "."));
	const usedAmount = await db.getBudgetUsedAmount(params.budgetId);

	if (newAmount < usedAmount) {
		return { error: "cannot_reduce", usedAmount };
	}

	const currentAmount = Number.parseFloat(budget.amount);
	if (newAmount > currentAmount) {
		const increase = newAmount - currentAmount;
		const availableFunds = await db.getAvailableFundsForYear(budget.year);

		if (increase > availableFunds) {
			return { error: "insufficient_funds", availableFunds };
		}
	}

	await db.updateFundBudget(params.budgetId, {
		name,
		description: description || null,
		amount: newAmount.toFixed(2),
	});

	// Sync transaction links
	const currentLinks = await db.getBudgetTransactions(params.budgetId);
	const currentIds = new Set(currentLinks.map(l => l.transaction.id));
	const selectedIds = new Set(selectedTransactionIds);

	// Add new links
	for (const id of selectedTransactionIds) {
		if (!currentIds.has(id)) {
			const tx = (await db.getAllTransactions()).find(t => t.id === id);
			if (tx) {
				await db.linkTransactionToBudget(tx.id, params.budgetId, tx.amount);
			}
		}
	}

	// Remove old links
	for (const link of currentLinks) {
		if (!selectedIds.has(link.transaction.id)) {
			await db.unlinkTransactionFromBudget(link.transaction.id, params.budgetId);
		}
	}

	return redirect(
		`/treasury/budgets/${params.budgetId}?success=updated`,
	);
}

export default function TreasuryBudgetsEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { budget, availableFunds, linkedTransactions, unlinkedTransactions } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [confirmAction, setConfirmAction] = useState<
		"close" | "reopen" | null
	>(null);
	const closeFormRef = useRef<HTMLFormElement>(null);
	const reopenFormRef = useRef<HTMLFormElement>(null);

	const [name, setName] = useState(budget.name);
	const [description, setDescription] = useState(budget.description || "");
	const [amount, setAmount] = useState(
		Number.parseFloat(budget.amount).toFixed(2).replace(".", ","),
	);
	const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>(
		linkedTransactions.map(t => t.id)
	);

	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.budgets.edit.title")} />

				{/* Error displays */}
				{actionData?.error === "insufficient_funds" && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
						{t("treasury.budgets.insufficient_funds", {
							available: formatCurrency(
								actionData.availableFunds as number,
							),
						})}
					</div>
				)}
				{actionData?.error === "cannot_reduce" && (
					<div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
						{t("treasury.budgets.cannot_reduce", {
							used: formatCurrency(
								actionData.usedAmount as number,
							),
						})}
					</div>
				)}

				<Form method="post" className="space-y-6">
					<input type="hidden" name="transactionIds" value={JSON.stringify(selectedTransactionIds)} />
					<TreasuryDetailCard title={t("treasury.budgets.view.title")}>
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
								{budget.year}
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
							<TreasuryField
								label={t("treasury.budgets.used")}
								valueClassName="font-medium"
							>
								{formatCurrency(budget.usedAmount)}
							</TreasuryField>
						</div>

						<TransactionsPicker
							linkedTransactions={linkedTransactions}
							unlinkedTransactions={unlinkedTransactions}
							selectedTransactionIds={selectedTransactionIds}
							onSelectionChange={(ids) => setSelectedTransactionIds(Array.isArray(ids) ? ids : [ids].filter(Boolean) as string[])}
							createUrl={`/treasury/transactions/new?year=${budget.year}&type=expense`}
							currentPath={`/treasury/budgets/${budget.id}/edit`}
							storageKey={`budget-${budget.id}-transactions`}
							label={t("treasury.budgets.linked_transactions")}
							maxItems={100}
							sourceEntityType="budget"
							sourceEntityId={budget.id}
							sourceEntityName={budget.name || ""}
						/>
					</TreasuryDetailCard>

					<TreasuryFormActions
						extraActions={
							<>
								{budget.status === "open" ? (
									<>
										<Form
											method="post"
											className="hidden"
											ref={closeFormRef}
										>
											<input
												type="hidden"
												name="_action"
												value="close"
											/>
										</Form>
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												setConfirmAction("close")
											}
										>
											<span className="material-symbols-outlined mr-2 text-sm">
												lock
											</span>
											{t(
												"treasury.budgets.actions.close",
											)}
										</Button>
									</>
								) : (
									<>
										<Form
											method="post"
											className="hidden"
											ref={reopenFormRef}
										>
											<input
												type="hidden"
												name="_action"
												value="reopen"
											/>
										</Form>
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												setConfirmAction("reopen")
											}
										>
											<span className="material-symbols-outlined mr-2 text-sm">
												lock_open
											</span>
											{t(
												"treasury.budgets.actions.reopen",
											)}
										</Button>
									</>
								)}
							</>
						}
					/>
				</Form>

				<ConfirmDialog
					open={confirmAction !== null}
					onOpenChange={(open) => !open && setConfirmAction(null)}
					title={
						confirmAction === "close"
							? t("treasury.budgets.actions.close")
							: t("treasury.budgets.actions.reopen")
					}
					description={
						confirmAction === "close"
							? t("treasury.budgets.close_confirm", {
								amount: formatCurrency(
									Number.parseFloat(budget.amount) -
									budget.usedAmount,
								),
							})
							: confirmAction === "reopen"
								? t("treasury.budgets.reopen_confirm")
								: ""
					}
					confirmLabel={t("common.actions.confirm")}
					cancelLabel={t("common.actions.cancel")}
					variant="default"
					onConfirm={() => {
						if (confirmAction === "close")
							closeFormRef.current?.requestSubmit();
						else if (confirmAction === "reopen")
							reopenFormRef.current?.requestSubmit();
						setConfirmAction(null);
					}}
				/>
			</div>
		</PageWrapper>
	);
}
