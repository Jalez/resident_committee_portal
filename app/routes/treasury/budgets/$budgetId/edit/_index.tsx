import { useTranslation } from "react-i18next";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm } from "~/components/ui/edit-form";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import type { AnyEntity } from "~/lib/entity-converters";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const name = (data as any)?.budget?.name || "Budget";
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${name} Edit` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "budget",
		permission: "treasury:budgets:update",
		permissionSelf: "treasury:budgets:update-self",
		params,
		request,
		fetchEntity: (db, id) => db.getFundBudgetById(id),
		extend: async ({ db, entity }) => {
			const usedAmount = await db.getBudgetUsedAmount(entity.id);
			const availableFunds = await db.getAvailableFundsForYear(entity.year);
			return {
				budget: {
					...entity,
					usedAmount,
					remainingAmount: Number.parseFloat(entity.amount) - usedAmount,
				},
				availableFunds,
			};
		},
	});
}

const updateBudgetSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
	status: z.enum(["open", "closed", "draft"]),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "budget",
		permission: "treasury:budgets:update",
		permissionSelf: "treasury:budgets:update-self",
		params,
		request,
		schema: updateBudgetSchema,
		fetchEntity: (db, id) => db.getFundBudgetById(id),
		onUpdate: ({ db, id, data, newStatus }) =>
			db.updateFundBudget(id, {
				...data,
				amount: Number.parseFloat(data.amount.replace(",", ".")).toFixed(2),
				status: (newStatus as any) || (data.status as any),
			}),
		beforeUpdate: async ({ db, entity, parsedData }) => {
			const newAmount = Number.parseFloat(parsedData.amount.replace(",", "."));
			const usedAmount = await db.getBudgetUsedAmount(entity.id);

			if (newAmount < usedAmount) {
				return { error: "cannot_reduce", usedAmount };
			}

			const currentAmount = Number.parseFloat(entity.amount);
			if (newAmount > currentAmount) {
				const increase = newAmount - currentAmount;
				const availableFunds = await db.getAvailableFundsForYear(entity.year);

				if (increase > availableFunds) {
					return { error: "insufficient_funds", availableFunds };
				}
			}
		},
	});
}

export default function TreasuryBudgetsEdit({
	loaderData,
}: Route.ComponentProps) {
	const {
		budget,
		availableFunds,
		relationships,
		contextValues,
		sourceContext,
		returnUrl,
	} = loaderData as any;
	const { t } = useTranslation();

	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	const currentPath = `/treasury/budgets/${budget.id}/edit`;

	// Define input fields
	const inputFields = {
		name: budget.name,
		description: budget.description || "",
		amount: budget.amount,
		status: {
			value: budget.status,
			type: "select" as const,
			options: ["open", "closed"],
		},
	};

	// Define read-only fields
	const readOnlyFields = {
		year: String(budget.year),
		available_funds: formatCurrency(availableFunds),
		used_funds: formatCurrency(budget.usedAmount),
	};

	// Define hidden fields
	const hiddenFields = {
		_sourceType: sourceContext?.type,
		_sourceId: sourceContext?.id,
		_returnUrl: returnUrl,
	};

	return (
		<PageWrapper>
			<EditForm
				title={t("treasury.budgets.edit.title")} // Card title
				action=""
				inputFields={inputFields as any}
				hiddenFields={hiddenFields as any}
				entityType="budget" // Enable auto-fill
				entityName={budget.name}
				readOnlyFields={readOnlyFields}
				entityId={budget.id}
				returnUrl={returnUrl || "/treasury/budgets"}
				relationships={relationships}
				translationNamespace="treasury.budgets"
			/>
		</PageWrapper>
	);
}
