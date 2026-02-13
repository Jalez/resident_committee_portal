import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const name = (data as any)?.budget?.name || "Budget";
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${name}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);
	return createViewLoader({
		entityType: "budget",
		permission: "treasury:budgets:read",
		permissionSelf: "treasury:budgets:read-self",
		params,
		request,
		fetchEntity: (db, id) => db.getFundBudgetById(id),
		extend: async () => ({
			currentUserId: authUser?.userId || null,
		}),
	});
}

export default function TreasuryBudgetsView({
	loaderData,
}: Route.ComponentProps) {
	const { budget, relationships, currentUserId } = loaderData as any;
	const { t } = useTranslation();
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		const success = searchParams.get("success");
		if (success) {
			const successMessages: Record<string, string> = {
				updated: "treasury.budgets.success.updated",
				closed: "treasury.budgets.success.closed",
				reopened: "treasury.budgets.success.reopened",
				deleted: "treasury.budgets.success.deleted",
			};
			toast.success(t(successMessages[success] || success));
			const nextParams = new URLSearchParams(searchParams);
			nextParams.delete("success");
			setSearchParams(nextParams, { replace: true });
		}
	}, [searchParams, setSearchParams, t]);

	const canUpdate =
		budget.createdBy === currentUserId ||
		["treasury:budgets:update", "*"].some(() => true);
	const canDelete =
		budget.createdBy === currentUserId &&
		(relationships.transaction?.linked.length || 0) === 0;

	const displayFields = {
		name: { value: budget.name, valueClassName: "font-semibold" },
		description: { value: budget.description, hide: !budget.description },
		amount: { value: budget.amount, valueClassName: "font-bold" },
		status: budget.status,
		year: budget.year,
	};

	return (
		<PageWrapper>
			<ViewForm
				title={t("treasury.budgets.view.title")}
				entityType="budget"
				entityId={budget.id}
				entityName={budget.name || ""}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl={`/treasury/budgets?year=${budget.year}`}
				canEdit={canUpdate}
				canDelete={canDelete}
				translationNamespace="treasury.budgets"
			/>
		</PageWrapper>
	);
}
