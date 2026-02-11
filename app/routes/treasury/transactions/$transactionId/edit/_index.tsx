import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	useActionData,
	useFetcher,
	useNavigate,
	useNavigation,
} from "react-router";
import { toast } from "sonner";
import {
	handleCreateItem,
	handleUpdateField,
} from "~/actions/inventory-actions";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { SmartAutofillButton } from "~/components/smart-autofill-button";
import {
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
	type TransactionType,
} from "~/components/treasury/transaction-details-form";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import { getDatabase } from "~/db";
import type { Purchase, Transaction, TransactionStatus } from "~/db/schema";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import {
	type AuthenticatedUser,
	requirePermissionOrSelf,
} from "~/lib/auth.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import { loadTransactionEditData } from "~/loaders/transaction-edit-loader";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const description = data?.transaction?.description;
	const title = description
		? `Muokkaa: ${description.substring(0, 30)} / Edit Transaction`
		: "Muokkaa tapahtumaa / Edit Transaction";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const data = await loadTransactionEditData({ request, params });

	await requirePermissionOrSelf(
		request,
		"treasury:transactions:update",
		"treasury:transactions:update-self",
		data.transaction.createdBy,
		getDatabase,
	);

	// Load relationships using new universal system
	const db = getDatabase();
	const relationships = await loadRelationshipsForEntity(
		db,
		"transaction",
		params.transactionId,
		["inventory", "budget", "reimbursement"],
	);

	// Get relationship context values for autofill
	const contextValues = await getRelationshipContext(
		db,
		"transaction",
		params.transactionId,
	);

	// Get source context and returnUrl from URL
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	return {
		...data,
		relationships,
		contextValues,
		sourceContext,
		returnUrl,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();
	const transaction = await db.getTransactionById(params.transactionId);
	if (!transaction) {
		throw new Response("Not Found", { status: 404 });
	}

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	const _year = transaction?.year || new Date().getFullYear();

	let _user: AuthenticatedUser | undefined;
	if (actionType !== "delete") {
		_user = await requirePermissionOrSelf(
			request,
			"treasury:transactions:update",
			"treasury:transactions:update-self",
			transaction?.createdBy,
			getDatabase,
		);
	}

	// Handle createItem action for InventoryPicker
	if (actionType === "createItem") {
		return await handleCreateItem(formData);
	}

	// Handle updateField action for inline editing inventory items
	if (actionType === "updateField") {
		return await handleUpdateField(formData);
	}

	// Guard: if actionType was set but not handled above
	if (actionType) {
		console.warn(`[Action] Unhandled action type: ${actionType}`);
		return {
			success: false,
			error: `Unhandled action type: ${actionType}`,
		};
	}

	// Transaction update logic has been moved to /api/transactions/:transactionId/update
	return null;
}

export default function EditTransaction({ loaderData }: Route.ComponentProps) {
	const {
		transaction,
		purchase,
		linkedItems,
		pickerItems,
		unlinkedPurchases,
		openBudgets,
		budgetLink,
		relationships,
		contextValues,
		sourceContext,
		returnUrl,
	} = loaderData as {
		transaction: Transaction;
		purchase: Purchase | null;
		linkedItems: Array<{
			id: string;
			name: string;
			description: string | null;
			quantity: number;
			location: string | null;
			category: string | null;
			availableQuantity: number;
		}>;
		pickerItems: Array<{
			id: string;
			name: string;
			description: string | null;
			quantity: number;
			location: string | null;
			category: string | null;
			availableQuantity: number;
		}>;
		uniqueLocations: string[];
		uniqueCategories: string[];
		currentYear: number;
		unlinkedPurchases: Purchase[];
		openBudgets: Array<{
			id: string;
			name: string;
			amount: string;
			status: string;
			year: number;
			createdBy: string | null;
			createdAt: Date;
			updatedAt: Date;
			description: string | null;
			usedAmount: number;
			remainingAmount: number;
		}>;
		budgetLink: {
			budget: { id: string };
			amount: string;
		} | null;
		relationships: Record<string, { linked: unknown[]; available: unknown[] }>;
		contextValues: {
			date: Date | null;
			totalAmount: number | null;
			description: string | null;
			category: string | null;
			valueSource: string | null;
		};
		sourceContext: { type: string; id: string; name?: string } | null;
		returnUrl: string | null;
	};
	const navigate = useNavigate();
	const navigation = useNavigation();
	const fetcher = useFetcher();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	interface ActionData {
		success?: boolean;
		message?: string;
		error?: string;
		linkedItemNames?: string;
	}

	const actionData = useActionData<ActionData>();
	const {
		items: contextItems,
		isHydrated,
		clearItems,
		setItems,
	} = useNewTransaction();
	const { t } = useTranslation();

	// Transaction form state — pre-populate from relationship context for drafts
	const isDraft = transaction.status === "draft";
	const [transactionType, setTransactionType] = useState<TransactionType>(
		transaction.type as TransactionType,
	);
	const [amount, setAmount] = useState(
		isDraft &&
			parseFloat(String(transaction.amount)) === 0 &&
			contextValues?.totalAmount
			? String(contextValues.totalAmount)
			: String(transaction.amount),
	);
	const [descriptionValue, setDescriptionValue] = useState(
		isDraft && !transaction.description && contextValues?.description
			? contextValues.description
			: transaction.description,
	);
	const [category, setCategory] = useState(
		isDraft && !transaction.category && contextValues?.category
			? contextValues.category
			: transaction.category || "",
	);
	const [dateValue, setDateValue] = useState(
		isDraft && contextValues?.date
			? new Date(contextValues.date).toISOString().split("T")[0]
			: new Date(transaction.date).toISOString().split("T")[0],
	);
	const [status, setStatus] = useState<TransactionStatus>(transaction.status);

	// Type is editable for draft transactions with no relationships
	const hasRelationships =
		relationships.inventory?.linked.length > 0 ||
		relationships.budget?.linked.length > 0 ||
		relationships.reimbursement?.linked.length > 0;
	const isTypeEditable = transaction.status === "draft" && !hasRelationships;

	// Smart autofill handlers
	const getTransactionValues = () => ({
		amount: amount,
		description: descriptionValue || "",
		category: category,
		date: dateValue,
	});
	const handleAutofillSuggestions = (
		suggestions: Record<string, string | number | null>,
	) => {
		if (suggestions.amount != null) setAmount(String(suggestions.amount));
		if (suggestions.description != null)
			setDescriptionValue(String(suggestions.description));
		if (suggestions.category != null) setCategory(String(suggestions.category));
		if (suggestions.date != null) setDateValue(String(suggestions.date));
	};

	// Use relationship picker hook
	const relationshipPicker = useRelationshipPicker({
		relationAType: "transaction",
		relationAId: transaction.id,
		initialRelationships: [],
	});

	// Build select options
	const categoryOptions = (
		transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
	).map((c) => ({
		value: c.value,
		label: t(`treasury.categories.${c.labelKey}`),
	}));

	const statusOptions = (
		["pending", "complete", "paused", "declined"] as const
	).map((s) => ({
		value: s,
		label: t(`treasury.breakdown.statuses.${s}`),
	}));

	const typeOptions = [
		{ value: "income", label: t("treasury.types.income") },
		{ value: "expense", label: t("treasury.types.expense") },
	];

	// Strict amount from inventory items — always override when items exist
	useEffect(() => {
		if (
			category === "inventory" &&
			relationships.inventory?.linked.length > 0
		) {
			const totalValue = relationships.inventory.linked.reduce(
				(sum: number, item: any) =>
					sum + Number(item.value || 0) * (item.quantity || 1),
				0,
			);
			setAmount(totalValue.toFixed(2));
		}
	}, [relationships.inventory, category]);

	// Toast on fetcher success/error
	useEffect(() => {
		if (fetcher.state !== "idle") return;
		if (!fetcher.data || typeof fetcher.data !== "object") return;

		const data = fetcher.data as {
			success?: boolean;
			error?: string;
			message?: string;
			redirectTo?: string;
		};

		if (data.error) {
			toast.error(data.error);
			return;
		}

		if (data.success) {
			toast.success(data.message || "Action completed");
			if (data.redirectTo) {
				navigate(data.redirectTo);
			}
		}
	}, [fetcher.state, fetcher.data, navigate]);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? t(actionData.error, {
							names: actionData.linkedItemNames,
						})
					: "An error occurred",
			);
		}
	}, [actionData, t]);

	const formatCurrency = (value: string | number) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const currentPath = `/treasury/transactions/${transaction.id}/edit`;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader
					title={t("treasury.breakdown.edit.title")}
					actions={
						<SmartAutofillButton
							entityType="transaction"
							entityId={transaction.id}
							getCurrentValues={getTransactionValues}
							onSuggestions={handleAutofillSuggestions}
							useAI={isDraft}
						/>
					}
				/>

				<Form
					method="post"
					action={`/api/transactions/${transaction.id}/update`}
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

					<input type="hidden" name="type" value={transactionType} />
					<input type="hidden" name="year" value={transaction.year} />

					<TreasuryDetailCard title={t("treasury.breakdown.edit.title")}>
						<div className="grid gap-4">
							{isTypeEditable ? (
								<TreasuryField
									mode="edit"
									label={`${t("common.fields.type")} *`}
									name="type"
									type="select"
									value={transactionType}
									onChange={(v) => {
										setTransactionType(v as TransactionType);
										// Reset category when type changes
										setCategory("");
									}}
									options={typeOptions}
									required
								/>
							) : (
								<TreasuryField label={t("common.fields.type")}>
									<input type="hidden" name="type" value={transactionType} />
									{t(`treasury.types.${transactionType}`)}
								</TreasuryField>
							)}
							<TreasuryField label={t("common.fields.year")}>
								{transaction.year}
							</TreasuryField>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.amount")} *`}
								name="amount"
								type="number"
								value={amount}
								onChange={setAmount}
								required
								step="0.01"
								min="0.01"
								disabled={
									category === "inventory" &&
									relationships.inventory?.linked.length > 0
								}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.description")} *`}
								name="description"
								type="text"
								value={descriptionValue}
								onChange={setDescriptionValue}
								required
								placeholder={t("treasury.form.description_placeholder")}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.breakdown.category", "Category")} *`}
								name="category"
								type="select"
								value={category}
								onChange={setCategory}
								options={categoryOptions}
								required
							/>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.date")} *`}
								name="date"
								type="date"
								value={dateValue}
								onChange={setDateValue}
								required
							/>

							<TreasuryField
								mode="edit"
								label={t("treasury.breakdown.status")}
								name="status"
								type="select"
								value={status}
								onChange={(v) => setStatus(v as TransactionStatus)}
								options={statusOptions}
							/>
						</div>

						{/* Relationships Section */}
						<RelationshipPicker
							relationAType="transaction"
							relationAId={transaction.id}
							relationAName={transaction.description || ""}
							mode="edit"
							currentPath={currentPath}
							sections={[
								// Inventory section - only for inventory category
								...(category === "inventory"
									? [
											{
												relationBType: "inventory" as const,
												linkedEntities: (relationships.inventory?.linked ||
													[]) as AnyEntity[],
												availableEntities: (relationships.inventory
													?.available || []) as AnyEntity[],
												createType: "inventory",
												label: t("treasury.inventory.title"),
											},
										]
									: []),
								// Budget section - only for expenses
								...(transactionType === "expense"
									? [
											{
												relationBType: "budget" as const,
												linkedEntities: (relationships.budget?.linked ||
													[]) as AnyEntity[],
												availableEntities: (relationships.budget?.available ||
													[]) as AnyEntity[],
												maxItems: 1,
												createType: "budget",
												label: t("treasury.budgets.title"),
											},
										]
									: []),
								// Reimbursement section - only for expenses
								...(transactionType === "expense"
									? [
											{
												relationBType: "reimbursement" as const,
												linkedEntities: (relationships.reimbursement?.linked ||
													[]) as AnyEntity[],
												availableEntities: (relationships.reimbursement
													?.available || []) as AnyEntity[],
												maxItems: 1,
												createType: "reimbursement",
												label: t("treasury.reimbursements.title"),
											},
										]
									: []),
							]}
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							formData={relationshipPicker.toFormData()}
						/>
					</TreasuryDetailCard>
					<TreasuryFormActions
						isSubmitting={isSubmitting}
						deleteAction={`/api/transactions/${transaction.id}/delete`}
						deleteTitle={t("treasury.breakdown.edit.delete_title")}
						onCancel={() => navigate(returnUrl || "/treasury/transactions")}
						deleteDescription={`${t("treasury.breakdown.edit.delete_confirm")}\n\n${transaction.description} (${formatCurrency(transaction.amount)})`}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
