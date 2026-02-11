import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigate } from "react-router";
import { z } from "zod";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { SmartAutofillButton } from "~/components/smart-autofill-button";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { getDatabase } from "~/db";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import type { Route } from "./+types/_index";

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

	// Get relationship context values for autofill (uses domination scale)
	const contextValues = await getRelationshipContext(
		db,
		"budget",
		params.budgetId,
	);

	// Get currently linked transactions via entity relationships
	const budgetRelationships = await db.getEntityRelationships(
		"budget",
		budget.id,
	);
	const linkedTransactionIds = budgetRelationships
		.filter((r) => r.relationBType === "transaction")
		.map((r) => r.relationBId);
	const linkedTransactions = await Promise.all(
		linkedTransactionIds.map((id) => db.getTransactionById(id)),
	).then((results) =>
		results.filter((t): t is NonNullable<typeof t> => t !== null),
	);

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
		contextValues,
		sourceContext,
		returnUrl,
	};
}

const _updateBudgetSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
});

export async function action() {
	// Budget update logic has been moved to /api/budgets/:budgetId/update
	return null;
}

export default function TreasuryBudgetsEdit({
	loaderData,
}: Route.ComponentProps) {
	const {
		budget,
		availableFunds,
		linkedTransactions,
		unlinkedTransactions,
		relationships,
		contextValues,
		sourceContext,
		returnUrl,
	} = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [confirmAction, setConfirmAction] = useState<"close" | "reopen" | null>(
		null,
	);
	const closeFormRef = useRef<HTMLFormElement>(null);
	const reopenFormRef = useRef<HTMLFormElement>(null);

	// Pre-populate from relationship context if budget is a draft with defaults
	const initialAmount =
		budget.status === "draft" &&
		Number.parseFloat(budget.amount) === 0 &&
		contextValues?.totalAmount
			? contextValues.totalAmount.toFixed(2).replace(".", ",")
			: Number.parseFloat(budget.amount).toFixed(2).replace(".", ",");
	const initialName =
		budget.status === "draft" &&
		(!budget.name || budget.name === "") &&
		contextValues?.description
			? contextValues.description
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

	// Smart autofill handlers
	const getBudgetValues = () => ({
		amount: amount,
		name: name || "",
		description: description,
	});
	const handleAutofillSuggestions = (
		suggestions: Record<string, string | number | null>,
	) => {
		if (suggestions.amount != null)
			setAmount(String(suggestions.amount).replace(".", ","));
		if (suggestions.name != null) setName(String(suggestions.name));
		if (suggestions.description != null)
			setDescription(String(suggestions.description));
	};

	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	const currentPath = `/treasury/budgets/${budget.id}/edit`;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader
					title={t("treasury.budgets.edit.title")}
					actions={
						<SmartAutofillButton
							entityType="budget"
							entityId={budget.id}
							getCurrentValues={getBudgetValues}
							onSuggestions={handleAutofillSuggestions}
						/>
					}
				/>

				<Form
					method="post"
					action={`/api/budgets/${budget.id}/update`}
					className="space-y-6"
				>
					{/* Hidden fields for source context (auto-linking when created from picker) */}
					{sourceContext && (
						<>
							<input
								type="hidden"
								name="_sourceType"
								value={sourceContext.type}
							/>
							<input type="hidden" name="_sourceId" value={sourceContext.id} />
						</>
					)}
					{returnUrl && (
						<input type="hidden" name="_returnUrl" value={returnUrl} />
					)}

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
								placeholder={t("treasury.budgets.name_placeholder")}
							/>
							<TreasuryField
								mode="edit"
								label={t("treasury.budgets.description")}
								name="description"
								type="textarea"
								value={description}
								onChange={setDescription}
								placeholder={t("treasury.budgets.description_placeholder")}
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
							sections={[
								{
									relationBType: "transaction",
									linkedEntities: (relationships.transaction?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.transaction?.available ||
										[]) as unknown as AnyEntity[],
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
						onCancel={() => navigate(returnUrl || "/treasury/budgets")}
						extraActions={
							budget.status === "open" ? (
								<>
									<Form
										method="post"
										action={`/api/budgets/${budget.id}/update`}
										className="hidden"
										ref={closeFormRef}
									>
										<input type="hidden" name="_action" value="close" />
									</Form>
									<Button
										type="button"
										variant="outline"
										onClick={() => setConfirmAction("close")}
									>
										<span className="material-symbols-outlined mr-2 text-sm">
											lock
										</span>
										{t("treasury.budgets.actions.close")}
									</Button>
								</>
							) : (
								<>
									<Form
										method="post"
										action={`/api/budgets/${budget.id}/update`}
										className="hidden"
										ref={reopenFormRef}
									>
										<input type="hidden" name="_action" value="reopen" />
									</Form>
									<Button
										type="button"
										variant="outline"
										onClick={() => setConfirmAction("reopen")}
									>
										<span className="material-symbols-outlined mr-2 text-sm">
											lock_open
										</span>
										{t("treasury.budgets.actions.reopen")}
									</Button>
								</>
							)
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
										Number.parseFloat(budget.amount) - budget.usedAmount,
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
