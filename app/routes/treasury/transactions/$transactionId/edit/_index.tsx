import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import {
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "~/components/treasury/transaction-details-form";
import { EditForm } from "~/components/ui/edit-form";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
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
	category: z.string().min(1, "Category is required"),
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
				year: typeof data.year === "string" ? parseInt(data.year, 10) : data.year,
				status: (newStatus as any) || (data.status as any),
			});
		},
		successRedirect: (entity) => `/treasury/breakdown?year=${entity.year}`,
	});
}

export default function EditTransaction({ loaderData }: Route.ComponentProps) {
	const { transaction, relationships, openBudgets, returnUrl, sourceContext } =
		loaderData as any;
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

	const categories = currentType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

	const inputFields = useMemo(() => ({
		description: transaction.description,
		amount: transaction.amount,
		type: {
			type: "select",
			value: currentType,
			options: [
				{ label: t("treasury.transactions.types.income"), value: "income" },
				{ label: t("treasury.transactions.types.expense"), value: "expense" },
			],
		},
		year: {
			type: "select",
			value: String(transaction.year),
			options: yearOptions,
		},
		category: {
			type: "select",
			value: transaction.category,
			options: categories.map((c) => ({
				label: t(`treasury.categories.${c.labelKey}`),
				value: c.value,
			})),
		},
		status: transaction.status,
		notes: transaction.notes,
		reimbursementStatus: transaction.reimbursementStatus,
	}), [transaction, currentType, yearOptions, categories, t]);

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