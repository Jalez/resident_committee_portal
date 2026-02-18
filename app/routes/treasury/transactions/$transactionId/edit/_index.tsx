import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm } from "~/components/ui/edit-form";
import type { PurchaseStatus } from "~/db/schema";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { mapPurchaseStatusToTransactionControl } from "~/lib/relationships/transaction-control";
import { getControlledTransactionFields } from "~/lib/relationships/transaction-control.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const description = (data as any)?.transaction?.description;
	const title = description
		? `Muokkaa: ${description.substring(0, 30)} / Edit Transaction`
		: "Muokkaa tapahtumaa / Edit Transaction";
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "transaction",
		permission: "treasury:transactions:update",
		permissionSelf: "treasury:transactions:update-self",
		params,
		request,
		fetchEntity: (db, id) => db.getTransactionById(id),
		extend: async ({ db, entity }) => {
			const openBudgets = await db.getOpenFundBudgetsByYear(entity.year);
			const enrichedBudgets = await Promise.all(
				openBudgets.map(async (budget) => {
					const usedAmount = await db.getBudgetUsedAmount(budget.id);
					return {
						...budget,
						usedAmount,
						remainingAmount: Number.parseFloat(budget.amount) - usedAmount,
					};
				}),
			);

			return {
				openBudgets: enrichedBudgets,
			};
		},
	});
}

const transactionSchema = z.object({
	description: z.string().min(1, "Description is required"),
	amount: z.string().regex(/^[\d.,]+$/, "Invalid amount"),
	status: z.string().optional(),
	reimbursementStatus: z.string().optional(),
	notes: z.string().optional(),
	type: z.enum(["income", "expense"]),
	year: z.string().or(z.number()),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "transaction",
		permission: "treasury:transactions:update",
		permissionSelf: "treasury:transactions:update-self",
		params,
		request,
		schema: transactionSchema,
		fetchEntity: (db, id) => db.getTransactionById(id),
		onUpdate: ({ db, id, data, newStatus }) => {
			return db.updateTransaction(id, {
				...data,
				amount: data.amount.replace(",", "."),
				year:
					typeof data.year === "string" ? parseInt(data.year, 10) : data.year,
				status: (newStatus as any) || (data.status as any),
			});
		},
		afterUpdate: async ({ db, entity }) => {
			const transaction = await db.getTransactionById(entity.id);
			if (!transaction) return;

			const controlled = await getControlledTransactionFields(db, entity.id);
			const updates: Record<string, string | number> = {};

			if (controlled.amount !== undefined) {
				const currentAmount = Number.parseFloat(transaction.amount || "0");
				const controlledAmount = Number.parseFloat(controlled.amount);
				const amountMismatch =
					Number.isNaN(currentAmount) ||
					Math.abs(currentAmount - controlledAmount) > 0.00001;
				if (amountMismatch) {
					updates.amount = controlled.amount;
				}
			}

			if (
				controlled.description !== undefined &&
				transaction.description !== controlled.description
			) {
				updates.description = controlled.description;
			}

			if (
				controlled.type !== undefined &&
				transaction.type !== controlled.type
			) {
				updates.type = controlled.type;
			}

			if (
				controlled.status !== undefined &&
				transaction.status !== controlled.status
			) {
				updates.status = controlled.status;
			}

			if (
				controlled.reimbursementStatus !== undefined &&
				transaction.reimbursementStatus !== controlled.reimbursementStatus
			) {
				updates.reimbursementStatus = controlled.reimbursementStatus;
			}
			if (
				controlled.year !== undefined &&
				transaction.year !== controlled.year
			) {
				updates.year = controlled.year;
			}

			if (Object.keys(updates).length > 0) {
				await db.updateTransaction(entity.id, updates as any);
			}
		},
		successRedirect: (entity) => `/treasury/breakdown?year=${entity.year}`,
	});
}

export default function EditTransaction({ loaderData }: Route.ComponentProps) {
	const {
		transaction,
		relationships,
		openBudgets,
		returnUrl,
		sourceContext,
		contextValues,
	} = loaderData as any;
	const { t } = useTranslation();

	const currentYear = new Date().getFullYear();
	const [currentType, setCurrentType] = useState<"income" | "expense">(
		transaction.type,
	);

	const yearOptions = useMemo(() => {
		return [
			{ label: String(currentYear - 1), value: String(currentYear - 1) },
			{ label: String(currentYear), value: String(currentYear) },
			{ label: String(currentYear + 1), value: String(currentYear + 1) },
		];
	}, [currentYear]);

	const linkedReimbursement = relationships?.reimbursement?.linked?.[0] as
		| { status?: PurchaseStatus; description?: string; id?: string }
		| undefined;
	const reimbursementControl = linkedReimbursement?.status
		? mapPurchaseStatusToTransactionControl(linkedReimbursement.status)
		: null;
	const hasReimbursementControl = Boolean(linkedReimbursement);
	const effectiveType: "income" | "expense" = hasReimbursementControl
		? "expense"
		: currentType;

	const sourceControl = useMemo(() => {
		const source = contextValues?.valueSource;
		if (source !== "receipt" && source !== "reimbursement") return null;

		const sourceLabel =
			source === "receipt"
				? t("common.relationships.receipt", { defaultValue: "receipt" })
				: t("common.relationships.reimbursement", {
						defaultValue: "reimbursement request",
					});

		const sourceEntities =
			source === "receipt"
				? relationships?.receipt?.linked || []
				: relationships?.reimbursement?.linked || [];

		const sourceEntity = sourceEntities[0] as
			| Record<string, unknown>
			| undefined;
		const sourceNameCandidates = [
			sourceEntity?.name,
			sourceEntity?.description,
			sourceEntity?.storeName,
			sourceEntity?.purchaserName,
			sourceEntity?.title,
			sourceEntity?.id,
		];
		const sourceName = sourceNameCandidates.find(
			(value) => typeof value === "string" && value.trim().length > 0,
		) as string | undefined;

		return {
			source,
			sourceLabel,
			sourceName,
		};
	}, [contextValues?.valueSource, relationships, t]);

	const amountControl = useMemo(() => {
		const totalAmount = contextValues?.totalAmount;
		if (!sourceControl || typeof totalAmount !== "number") return null;

		const description = sourceControl.sourceName
			? t("treasury.transactions.amount_controlled_named", {
					defaultValue:
						"Amount is controlled by linked {{sourceLabel}}: {{sourceName}}. Unlink it to edit manually.",
					sourceLabel: sourceControl.sourceLabel,
					sourceName: sourceControl.sourceName,
				})
			: t("treasury.transactions.amount_controlled", {
					defaultValue:
						"Amount is controlled by linked {{sourceLabel}}. Unlink it to edit manually.",
					sourceLabel: sourceControl.sourceLabel,
				});

		return {
			amountValue: totalAmount.toFixed(2),
			description,
		};
	}, [contextValues?.totalAmount, sourceControl, t]);

	const descriptionControl = useMemo(() => {
		const controlledDescription = contextValues?.description?.trim();
		if (!sourceControl || !controlledDescription) return null;

		const description = sourceControl.sourceName
			? t("treasury.transactions.description_controlled_named", {
					defaultValue:
						"Description is controlled by linked {{sourceLabel}}: {{sourceName}}.",
					sourceLabel: sourceControl.sourceLabel,
					sourceName: sourceControl.sourceName,
				})
			: t("treasury.transactions.description_controlled", {
					defaultValue: "Description is controlled by linked {{sourceLabel}}.",
					sourceLabel: sourceControl.sourceLabel,
				});

		return {
			value: controlledDescription,
			description,
		};
	}, [contextValues?.description, sourceControl, t]);

	const yearControl = useMemo(() => {
		if (!sourceControl || !contextValues?.date) return null;
		const parsedDate =
			contextValues.date instanceof Date
				? contextValues.date
				: new Date(contextValues.date);
		if (Number.isNaN(parsedDate.getTime())) return null;
		const controlledYear = parsedDate.getFullYear();
		const description = sourceControl.sourceName
			? t("treasury.transactions.year_controlled_named", {
					defaultValue:
						"Year is controlled by linked {{sourceLabel}}: {{sourceName}}.",
					sourceLabel: sourceControl.sourceLabel,
					sourceName: sourceControl.sourceName,
				})
			: t("treasury.transactions.year_controlled", {
					defaultValue: "Year is controlled by linked {{sourceLabel}}.",
					sourceLabel: sourceControl.sourceLabel,
				});

		return {
			value: String(controlledYear),
			description,
		};
	}, [contextValues?.date, sourceControl, t]);

	const inputFields = useMemo(
		() => ({
			description: {
				value: descriptionControl?.value ?? transaction.description,
				readOnly: Boolean(descriptionControl),
				description: descriptionControl?.description,
			},
			amount: {
				type: "currency",
				value: amountControl?.amountValue ?? transaction.amount,
				readOnly: Boolean(amountControl),
				description: amountControl?.description,
				valueClassName: amountControl ? "font-semibold" : undefined,
			},
			type: {
				type: "select",
				value: effectiveType,
				readOnly: hasReimbursementControl,
				description: hasReimbursementControl
					? t("treasury.transactions.type_controlled_by_reimbursement", {
							defaultValue:
								"Type is locked to Expense while linked to a reimbursement request.",
						})
					: undefined,
				options: [
					{ label: t("treasury.transactions.types.income"), value: "income" },
					{ label: t("treasury.transactions.types.expense"), value: "expense" },
				],
			},
			year: {
				type: "select",
				value: yearControl?.value ?? String(transaction.year),
				readOnly: Boolean(yearControl),
				description: yearControl?.description,
				options: yearOptions,
			},
			status: {
				value: reimbursementControl?.status ?? transaction.status,
				readOnly: hasReimbursementControl,
				description: hasReimbursementControl
					? t("treasury.transactions.status_controlled_by_reimbursement", {
							defaultValue:
								"Status follows the linked reimbursement request state.",
						})
					: undefined,
			},
			notes: transaction.notes,
			reimbursementStatus:
				reimbursementControl?.reimbursementStatus ||
				transaction.reimbursementStatus,
		}),
		[
			transaction,
			effectiveType,
			yearOptions,
			t,
			amountControl,
			descriptionControl,
			yearControl,
			hasReimbursementControl,
			reimbursementControl?.status,
			reimbursementControl?.reimbursementStatus,
		],
	);

	const handleFieldChange = (name: string, value: any) => {
		if (name === "type" && (value === "income" || value === "expense")) {
			setCurrentType(value);
		}
	};

	const hiddenFields = {
		_sourceType: sourceContext?.type,
		_sourceId: sourceContext?.id,
		_returnUrl: returnUrl,
	};

	const relationshipsData = {
		...relationships,
		budget: {
			linked: relationships.budget?.linked || [],
			available: openBudgets || [],
		},
	};

	return (
		<PageWrapper>
			<EditForm
				title={t("treasury.transactions.edit.title")}
				action=""
				inputFields={inputFields as any}
				hiddenFields={hiddenFields as any}
				entityType="transaction"
				entityId={transaction.id}
				entityName={transaction.description}
				returnUrl={returnUrl || `/treasury/breakdown?year=${transaction.year}`}
				relationships={relationshipsData}
				translationNamespace="treasury.transactions"
				onFieldChange={handleFieldChange}
			/>
		</PageWrapper>
	);
}
