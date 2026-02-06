import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { maskBankAccount } from "~/lib/mask-bank-account";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { TransactionDetailsForm } from "~/components/treasury/transaction-details-form";
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
import type { Route } from "./+types/treasury.reimbursements.$purchaseId";

export function meta({ data }: Route.MetaArgs) {
	const description = data?.purchase?.description;
	const title = description
		? `${description.substring(0, 30)} / View Reimbursement`
		: "View Reimbursement";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const purchase = await db.getPurchaseById(params.purchaseId);

	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-read support
	await requirePermissionOrSelf(
		request,
		"treasury:reimbursements:read",
		"treasury:reimbursements:read-self",
		purchase.createdBy,
		getDatabase,
	);

	// Get linked transaction if exists
	let linkedTransaction = null;
	if (purchase.id) {
		linkedTransaction = await db.getTransactionByPurchaseId(purchase.id);
	}

	// Get receipts for picker
	const receiptsByYear = await getReceiptsByYear();
	const currentYear = new Date().getFullYear();

	// Get inventory items available for picker (for display)
	const pickerItems = await db.getInventoryItemsForPicker();

	// Get unique locations and categories for picker filters
	const allInventoryItems = await db.getInventoryItems();
	const uniqueLocations = [
		...new Set(allInventoryItems.map((item) => item.location).filter(Boolean)),
	].sort();
	const uniqueCategories = [
		...new Set(
			allInventoryItems
				.map((item) => item.category)
				.filter(Boolean) as string[],
		),
	].sort();

	// Get linked inventory items if transaction exists
	let linkedItems: (InventoryItem & { quantity: number })[] = [];
	if (linkedTransaction) {
		linkedItems = await db.getInventoryItemsForTransaction(linkedTransaction.id);
	}

	return {
		siteConfig: SITE_CONFIG,
		purchase,
		linkedTransaction,
		linkedItems,
		currentYear,
		recentMinutes: [] as MinuteFile[],
		emailConfigured: await isEmailConfigured(),
		receiptsByYear,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
	};
}

export default function ViewReimbursement({ loaderData }: Route.ComponentProps) {
	const {
		purchase,
		linkedTransaction,
		linkedItems,
		currentYear,
	} = loaderData as {
		purchase: Purchase;
		linkedTransaction: Transaction | null;
		linkedItems: (InventoryItem & { quantity: number })[];
		currentYear: number;
	};
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();

	// Check if user can edit
	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:reimbursements:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("treasury:reimbursements:update-self") &&
		purchase.createdBy &&
		rootData?.user?.userId === purchase.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	// Can view full bank account if user can update OR is the creator
	const isCreator = purchase.createdBy && rootData?.user?.userId === purchase.createdBy;
	const canViewFullBankAccount = canUpdateGeneral || isCreator;

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
					<PageHeader title={t("treasury.reimbursements.view.title")} />
					{canUpdate && (
						<Link to={`/treasury/reimbursements/${purchase.id}/edit`}>
							<Button variant="default">
								<span className="material-symbols-outlined mr-2">edit</span>
								{t("common.actions.edit")}
							</Button>
						</Link>
					)}
				</div>

				<div className="space-y-6">
					{/* Reimbursement Form - all disabled */}
					<SectionCard>
						<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
							{t("treasury.reimbursements.edit.reimbursement_details")}
						</h2>
						<div className="space-y-4">
							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("treasury.new_reimbursement.description")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white">
									{purchase.description || "—"}
								</p>
							</div>
							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("treasury.new_reimbursement.amount")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white font-bold">
									{formatCurrency(purchase.amount)}
								</p>
							</div>
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
							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("treasury.reimbursements.status")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white">
									{t(`treasury.reimbursements.statuses.${purchase.status}`)}
								</p>
							</div>
						</div>
					</SectionCard>

					{/* Transaction Section - if linked */}
					{linkedTransaction && (
						<SectionCard>
							<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
								{t("treasury.new_reimbursement.transaction_section_title")}
							</h2>
							<LinkedItemInfo
								description={linkedTransaction.description}
								amount={linkedTransaction.amount}
								date={new Date(linkedTransaction.date).toISOString().split("T")[0]}
								year={linkedTransaction.year}
							/>
							<TransactionDetailsForm
								transactionType="expense"
								onTypeChange={() => { }}
								amount={linkedTransaction.amount}
								onAmountChange={() => { }}
								description={linkedTransaction.description}
								onDescriptionChange={() => { }}
								category={linkedTransaction.category || "other"}
								onCategoryChange={() => { }}
								date={new Date(linkedTransaction.date).toISOString().split("T")[0]}
								onDateChange={() => { }}
								year={linkedTransaction.year}
								onYearChange={() => { }}
								yearOptions={yearOptions}
								showTypeSelector={false}
								showCard={false}
								disabled={true}
							/>

							{/* Inventory Selection Section - shown when category is "inventory" */}
							{linkedTransaction.category === "inventory" &&
								linkedItems.length > 0 && (
									<div className="space-y-4 mt-4">
										<h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
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
									</div>
								)}
						</SectionCard>
					)}
				</div>
			</div>
		</PageWrapper>
	);
}
