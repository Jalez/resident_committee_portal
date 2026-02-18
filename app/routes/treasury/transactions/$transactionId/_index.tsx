import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouteLoaderData, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const description = (data as any)?.transaction?.description;
	const title = description
		? `${description.substring(0, 30)} / View Transaction`
		: "View Transaction";
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createViewLoader({
		entityType: "transaction",
		permission: "treasury:transactions:read",
		permissionSelf: "treasury:transactions:read-self",
		params,
		request,
		fetchEntity: (db, id) =>
			db
				.getAllTransactions()
				.then((txs) => txs.find((t) => t.id === id) || null),
	});
}

export default function ViewTransaction({ loaderData }: Route.ComponentProps) {
	const { transaction, relationships } = loaderData as any;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();
	const [searchParams, setSearchParams] = useSearchParams();

	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:transactions:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes(
			"treasury:transactions:update-self",
		) &&
		transaction.createdBy &&
		rootData?.user?.userId === transaction.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	const linkedReimbursements = relationships.reimbursement?.linked || [];
	const purchase =
		linkedReimbursements.length > 0 ? linkedReimbursements[0] : null;
	const isEditLocked = Boolean(
		purchase &&
			(purchase as any).emailSent &&
			(purchase as any).status !== "rejected",
	);

	useEffect(() => {
		const editBlocked = searchParams.get("editBlocked");
		if (!editBlocked) return;
		toast.error(
			t("treasury.transactions.edit_blocked", {
				defaultValue:
					"Editing is locked while the linked reimbursement request is pending.",
			}),
		);
		setSearchParams((prev) => {
			prev.delete("editBlocked");
			return prev;
		});
	}, [searchParams, setSearchParams, t]);

	const displayFields = {
		type: transaction.type,
		amount: { value: transaction.amount, valueClassName: "font-bold" },
		description: transaction.description || "—",
		date: transaction.date,
		year: transaction.year,
		status: transaction.status,
	};

	return (
		<PageWrapper>
			<ViewForm
				title={t("treasury.breakdown.view.title")}
				entityType="transaction"
				entityId={transaction.id}
				entityName={transaction.description || ""}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/treasury/transactions"
				canEdit={canUpdate && !isEditLocked}
				canDelete={canUpdate && !isEditLocked}
				translationNamespace="treasury.transactions"
			/>
		</PageWrapper>
	);
}
