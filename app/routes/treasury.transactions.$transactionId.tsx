import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import { Button } from "~/components/ui/button";
import {
	getDatabase,
	type Transaction,
} from "~/db";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import type { AnyEntity } from "~/lib/entity-converters";
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

	// Load relationships using new universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"transaction",
		params.transactionId,
		["inventory", "budget", "reimbursement"],
	);

	return {
		siteConfig: SITE_CONFIG,
		transaction,
		relationships,
	};
}

export default function ViewTransaction({ loaderData }: Route.ComponentProps) {
	const {
		transaction,
		relationships,
	} = loaderData as {
		transaction: Transaction;
		relationships: Awaited<ReturnType<typeof loadRelationshipsForEntity>>;
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

	// Check if editing is locked due to linked reimbursement
	const linkedReimbursements = relationships.reimbursement?.linked || [];
	const purchase = linkedReimbursements.length > 0 ? linkedReimbursements[0] : null;
	const isEditLocked = Boolean(
		purchase && (purchase as { emailSent?: boolean; status?: string }).emailSent &&
		(purchase as { emailSent?: boolean; status?: string }).status !== "rejected",
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

						<RelationshipPicker
							relationAType="transaction"
							relationAId={transaction.id}
							relationAName={transaction.description || ""}
							mode="view"
							sections={[
								{
									relationBType: "inventory",
									linkedEntities: (relationships.inventory?.linked || []) as unknown as AnyEntity[],
									availableEntities: [],
								},
								{
									relationBType: "budget",
									linkedEntities: (relationships.budget?.linked || []) as unknown as AnyEntity[],
									availableEntities: [],
								},
								{
									relationBType: "reimbursement",
									linkedEntities: (relationships.reimbursement?.linked || []) as unknown as AnyEntity[],
									availableEntities: [],
								},
							]}
						/>
					</TreasuryDetailCard>
				</div>
			</div>
		</PageWrapper>
	);
}
