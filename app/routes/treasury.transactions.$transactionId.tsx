import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { maskBankAccount } from "~/lib/mask-bank-account";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TransactionDetailsForm,
	type TransactionType,
} from "~/components/treasury/transaction-details-form";
import { type MinuteFile } from "~/components/treasury/reimbursement-form";
import { LinkedItemInfo } from "~/components/treasury/linked-item-info";
import { SectionCard } from "~/components/treasury/section-card";
import { Button } from "~/components/ui/button";
import {
	getDatabase,
	type InventoryItem,
	type Purchase,
	type Transaction,
} from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getReceiptsByYear } from "~/lib/receipts";
import { isEmailConfigured } from "~/lib/email.server";
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
		"transactions:read",
		"transactions:read-self",
		transaction.createdBy,
		getDatabase,
	);

	// Get linked purchase if exists
	let purchase = null;
	if (transaction.purchaseId) {
		purchase = await db.getPurchaseById(transaction.purchaseId);
	}

	// Get currently linked inventory items
	const linkedItems = await db.getInventoryItemsForTransaction(
		params.transactionId,
	);

	// Get receipts for picker (for display)
	const receiptsByYear = await getReceiptsByYear();
	const currentYear = new Date().getFullYear();

	return {
		siteConfig: SITE_CONFIG,
		transaction,
		purchase,
		linkedItems,
		currentYear,
		recentMinutes: [] as MinuteFile[],
		emailConfigured: isEmailConfigured(),
		receiptsByYear,
	};
}

export default function ViewTransaction({ loaderData }: Route.ComponentProps) {
	const {
		transaction,
		purchase,
		linkedItems,
		currentYear,
	} = loaderData as {
		transaction: Transaction;
		purchase: Purchase | null;
		linkedItems: (InventoryItem & { quantity: number })[];
		currentYear: number;
	};
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();

	// Check if user can edit
	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("transactions:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("transactions:update-self") &&
		transaction.createdBy &&
		rootData?.user?.userId === transaction.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	// Can view full bank account if user can update reimbursements OR is the purchase creator
	const canUpdateReimbursements =
		rootData?.user?.permissions?.includes("reimbursements:update") ||
		rootData?.user?.permissions?.includes("*");
	const isPurchaseCreator = !!(purchase?.createdBy && rootData?.user?.userId === purchase.createdBy);
	const canViewFullBankAccount = !!(canUpdateReimbursements || isPurchaseCreator);

	const formatCurrency = (value: string | number) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	// Generate year options (last 5 years)
	const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader title={t("treasury.breakdown.view.title")} />
					{canUpdate && (
						<Link to={`/treasury/transactions/${transaction.id}/edit`}>
							<Button variant="default">
								<span className="material-symbols-outlined mr-2">edit</span>
								{t("common.actions.edit")}
							</Button>
						</Link>
					)}
				</div>

				<div className="space-y-6">
					{/* Transaction Details Form - all disabled */}
					<TransactionDetailsForm
						transactionType={transaction.type as TransactionType}
						onTypeChange={() => { }}
						amount={transaction.amount}
						onAmountChange={() => { }}
						description={transaction.description}
						onDescriptionChange={() => { }}
						category={transaction.category || ""}
						onCategoryChange={() => { }}
						date={new Date(transaction.date).toISOString().split("T")[0]}
						onDateChange={() => { }}
						year={transaction.year}
						onYearChange={() => { }}
						yearOptions={yearOptions}
						showTypeSelector={true}
						showYearSelector={true}
						disabled={true}
					/>

					{/* Status Display */}
					<SectionCard>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("treasury.breakdown.status")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white">
									{t(`treasury.breakdown.statuses.${transaction.status}`)}
								</p>
							</div>
							{transaction.type === "expense" && (
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("treasury.breakdown.reimbursement_status")}
									</div>
									<p className="mt-1 text-gray-900 dark:text-white">
										{t(
											`treasury.breakdown.edit.reimbursement_statuses.${transaction.reimbursementStatus || "not_requested"}`,
										)}
									</p>
								</div>
							)}
						</div>
					</SectionCard>

					{/* Inventory Items Section - shown when category is "inventory" */}
					{transaction.category === "inventory" && linkedItems.length > 0 && (
						<SectionCard>
							<h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
								{t("treasury.breakdown.edit.linked_items")}
							</h3>
							<div className="space-y-2">
								{linkedItems.map((item) => (
									<div
										key={item.id}
										className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
									>
										<div className="flex items-center gap-3">
											<span className="material-symbols-outlined text-gray-400">
												package_2
											</span>
											<div>
												<p className="font-medium">{item.name}</p>
												<p className="text-xs text-gray-500">
													{item.quantity} {t("inventory.unit")} •{" "}
													{item.location}
													{item.value && parseFloat(item.value) > 0 && (
														<span className="ml-2">
															{formatCurrency(
																parseFloat(item.value) * item.quantity,
															)}
														</span>
													)}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>
						</SectionCard>
					)}

					{/* Reimbursement Section - Only for expenses */}
					{transaction.type === "expense" && purchase && (
						<SectionCard>
							<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
								{t("treasury.reimbursements.edit.reimbursement_details")}
							</h2>
							<LinkedItemInfo purchase={purchase} canViewFullBankAccount={canViewFullBankAccount} />
							<div className="space-y-4">
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("treasury.new_reimbursement.purchaser_name")}
									</div>
									<p className="mt-1 text-gray-900 dark:text-white">
										{purchase.purchaserName || "—"}
									</p>
								</div>
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("treasury.new_reimbursement.bank_account")}
									</div>
									<p className="mt-1 text-gray-900 dark:text-white font-mono">
										{canViewFullBankAccount
											? (purchase.bankAccount || "—")
											: maskBankAccount(purchase.bankAccount)}
									</p>
								</div>
								{purchase.notes && (
									<div>
										<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
											{t("treasury.new_reimbursement.notes")}
										</div>
										<p className="mt-1 text-gray-900 dark:text-white">
											{purchase.notes}
										</p>
									</div>
								)}
							</div>
						</SectionCard>
					)}
				</div>
			</div>
		</PageWrapper>
	);
}
