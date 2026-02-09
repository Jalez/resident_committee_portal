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
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { getDatabase } from "~/db";
import {
	requirePermissionOrSelf,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import type { AnyEntity } from "~/lib/entity-converters";
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

	// Get source context from URL (for auto-linking when created from picker)
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	// Get values from source entity (for pre-populating this entity)
	let sourceValues: { amount?: number; description?: string } | null = null;
	if (sourceContext && sourceContext.type === "transaction") {
		const sourceTransaction = await db.getTransactionById(sourceContext.id);
		if (sourceTransaction) {
			sourceValues = {
				amount: Number.parseFloat(sourceTransaction.amount),
				description: sourceTransaction.description,
			};
		}
	}

	// Get currently linked transactions via entity relationships
	const budgetRelationships = await db.getEntityRelationships("budget", budget.id);
	const linkedTransactionIds = budgetRelationships
		.filter((r) => r.relationBType === "transaction")
		.map((r) => r.relationBId);
	const linkedTransactions = await Promise.all(
		linkedTransactionIds.map((id) => db.getTransactionById(id))
	).then((results) => results.filter((t): t is NonNullable<typeof t> => t !== null));

	// Get unlinked transactions for this year
	const allTransactions = await db.getTransactionsByYear(budget.year);
	const unlinkedTransactions = allTransactions.filter(
		(t) => t.type === "expense" && !linkedTransactionIds.includes(t.id),
	);

	// Load relationships using new universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"budget",
		params.budgetId,
		["transaction"],
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
		relationships,
		sourceContext,
		returnUrl,
		sourceValues,
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

	// Save relationships using new universal system
	const user = await requirePermissionOrSelf(
		request,
		"treasury:budgets:update",
		"treasury:budgets:update-self",
		budget.createdBy,
		getDatabase,
	);
	await saveRelationshipChanges(db, "budget", params.budgetId, formData, user?.userId || null);

	// Check for source context to create auto-link (for backwards compatibility with old flow)
	// Note: Relationship may already exist if created via create-draft API
	const sourceType = formData.get("_sourceType") as string | null;
	const sourceId = formData.get("_sourceId") as string | null;
	if (sourceType && sourceId) {
		// Check if relationship already exists
		const exists = await db.entityRelationshipExists(
			sourceType as any,
			sourceId,
			"budget",
			params.budgetId,
		);
		if (!exists) {
			await db.createEntityRelationship({
				relationAType: sourceType as any,
				relationId: sourceId,
				relationBType: "budget",
				relationBId: params.budgetId,
				createdBy: user?.userId || null,
			});
		}
	}

	// Handle returnUrl redirect (from source entity picker)
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect(
		`/treasury/budgets/${params.budgetId}?success=updated`,
	);
}

export default function TreasuryBudgetsEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { budget, availableFunds, linkedTransactions, unlinkedTransactions, relationships, sourceContext, returnUrl, sourceValues } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [confirmAction, setConfirmAction] = useState<
		"close" | "reopen" | null
	>(null);
	const closeFormRef = useRef<HTMLFormElement>(null);
	const reopenFormRef = useRef<HTMLFormElement>(null);

	// Pre-populate from source entity values if budget is a draft with defaults
	const initialAmount = (budget.status === "draft" && Number.parseFloat(budget.amount) === 0 && sourceValues?.amount)
		? sourceValues.amount.toFixed(2).replace(".", ",")
		: Number.parseFloat(budget.amount).toFixed(2).replace(".", ",");
	const initialName = (budget.status === "draft" && (!budget.name || budget.name === "") && sourceValues?.description)
		? sourceValues.description
		: budget.name;

	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(budget.description || "");
	const [amount, setAmount] = useState(initialAmount);

	// Use relationship picker hook
	// Use relationship picker hook with existing linked transactions
	const relationshipPicker = useRelationshipPicker({
		relationAType: "budget",
		relationAId: budget.id,
		initialRelationships: linkedTransactions.map((t) => ({
			relationBType: "transaction",
			relationBId: t.id,
		})),
	});

	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	const currentPath = `/treasury/budgets/${budget.id}/edit`;

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
					{/* Hidden fields for source context (auto-linking when created from picker) */}
					{sourceContext && (
						<>
							<input type="hidden" name="_sourceType" value={sourceContext.type} />
							<input type="hidden" name="_sourceId" value={sourceContext.id} />
						</>
					)}
					{returnUrl && <input type="hidden" name="_returnUrl" value={returnUrl} />}

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

						{/* Relationships Section */}
						<RelationshipPicker
							relationAType="budget"
							relationAId={budget.id}
							relationAName={budget.name || ""}
							mode="edit"
							currentPath={currentPath}
							showAnalyzeButton={false}
							sections={[
								{
									relationBType: "transaction",
									linkedEntities: ((relationships.transaction?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.transaction?.available || []) as unknown) as AnyEntity[],
									createType: "transaction",
									label: t("treasury.budgets.linked_transactions"),
								},
							]}
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							formData={relationshipPicker.toFormData()}
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
