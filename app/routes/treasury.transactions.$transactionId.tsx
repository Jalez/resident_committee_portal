import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/treasury/colored-status-link-badge";
import {
	TreasuryDetailCard,
	TreasuryField,
	TreasuryRelationList,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import { Button } from "~/components/ui/button";
import {
	getDatabase,
	type Purchase,
	type Transaction,
} from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/treasury.transactions.$transactionId";

export function meta({ data }: Route.MetaArgs) {
	const description = data?.transaction?.description;
	const title = description
		? `${description.substring(0, 30)} / View Transaction`
		: "View Transaction";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const transactions = await db.getAllTransactions();
	const transaction = transactions.find((t) => t.id === params.transactionId);

	if (!transaction) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-read support
	await requirePermissionOrSelf(
		request,
		"treasury:transactions:read",
		"treasury:transactions:read-self",
		transaction.createdBy,
		getDatabase,
	);

	// Get linked purchase if exists
	let purchase = null;
	if (transaction.purchaseId) {
		purchase = await db.getPurchaseById(transaction.purchaseId);
	}

	const budgetLink = await db.getBudgetForTransaction(transaction.id);

	return {
		siteConfig: SITE_CONFIG,
		transaction,
		purchase,
		budgetLink,
	};
}

export default function ViewTransaction({ loaderData }: Route.ComponentProps) {
	const {
		transaction,
		purchase,
		budgetLink,
	} = loaderData as {
		transaction: Transaction;
		purchase: Purchase | null;
		budgetLink: { budget: { id: string; status: string; name: string }; amount: string } | null;
	};
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t, i18n } = useTranslation();
	const [searchParams, setSearchParams] = useSearchParams();

	// Check if user can edit
	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:transactions:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("treasury:transactions:update-self") &&
		transaction.createdBy &&
		rootData?.user?.userId === transaction.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;
	const isEditLocked = Boolean(
		purchase?.emailSent && purchase.status !== "rejected",
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

	const formatCurrency = (value: string | number) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);

	const purchaseRelations = purchase
		? [
				{
					to: `/treasury/reimbursements/${purchase.id}`,
					title:
						purchase.description ||
						purchase.id.substring(0, 8),
					status: "linked",
					id: purchase.id,
					variantMap: {
						linked:
							"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
					},
				},
			]
		: [];

	const budgetRelations = budgetLink
		? [
				{
					to: `/treasury/budgets/${budgetLink.budget.id}`,
					title: budgetLink.budget.name,
					status: budgetLink.budget.status,
					id: budgetLink.budget.id,
					variantMap: {
						linked:
							"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
						open:
							"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
						closed:
							"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
					},
				},
			]
		: [];

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader title={t("treasury.breakdown.view.title")} />
					{canUpdate && !isEditLocked && (
						<Link to={`/treasury/transactions/${transaction.id}/edit`}>
							<Button variant="default">
								<span className="material-symbols-outlined mr-2">edit</span>
								{t("common.actions.edit")}
							</Button>
						</Link>
					)}
				</div>

				<div className="space-y-6">
					<TreasuryDetailCard title={t("treasury.breakdown.view.title")}>
						<div className="grid gap-4">
							<TreasuryField label={t("treasury.breakdown.type", "Type")}>
								{transaction.type}
							</TreasuryField>
							<TreasuryField
								label={t("common.fields.amount")}
								valueClassName="text-foreground font-bold"
							>
								{formatCurrency(transaction.amount)}
							</TreasuryField>
							<TreasuryField label={t("common.fields.description")}
							>
								{transaction.description || "—"}
							</TreasuryField>
							<TreasuryField label={t("treasury.breakdown.category", "Category")}>
								{transaction.category || "—"}
							</TreasuryField>
							<TreasuryField label={t("common.fields.date")}>
								{formatDate(transaction.date)}
							</TreasuryField>
							<TreasuryField label={t("common.fields.year")}>
								{transaction.year}
							</TreasuryField>
							<TreasuryField label={t("treasury.breakdown.status")}
								valueClassName="text-foreground"
							>
								<TreasuryStatusPill
									value={transaction.status}
									variantMap={TREASURY_TRANSACTION_STATUS_VARIANTS}
									label={t(`treasury.breakdown.statuses.${transaction.status}`)}
								/>
							</TreasuryField>
						</div>

						<TreasuryRelationList
							label={t("treasury.reimbursements.reimbursement_request", "Reimbursement")}
							items={purchaseRelations}
							withSeparator
						/>

						<TreasuryRelationList
							label={t("treasury.budgets.title", "Budget")}
							items={budgetRelations}
							withSeparator
						/>
					</TreasuryDetailCard>
				</div>
			</div>
		</PageWrapper>
	);
}
