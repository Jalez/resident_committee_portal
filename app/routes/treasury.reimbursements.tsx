import { useTranslation } from "react-i18next";
import { Form, Link, useRouteLoaderData, useSearchParams } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	getDatabase,
	type InventoryItem,
	type Purchase,
	type PurchaseStatus,
} from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/treasury.reimbursements";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Kulukorvaukset / Reimbursements`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "reimbursements:read", getDatabase);
	const db = getDatabase();
	const url = new URL(request.url);
	const status = url.searchParams.get("status") || "all";
	const year = url.searchParams.get("year") || String(new Date().getFullYear());

	let purchases = await db.getPurchases();

	// Filter by year
	if (year !== "all") {
		purchases = purchases.filter((p) => p.year === parseInt(year, 10));
	}

	// Filter by status
	if (status !== "all") {
		purchases = purchases.filter((p) => p.status === status);
	}

	// Sort by date descending
	purchases.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	// Get inventory items for display
	const inventoryItems = await db.getInventoryItems();
	const itemsMap = new Map(inventoryItems.map((item) => [item.id, item]));

	// Enrich purchases
	const enrichedPurchases = purchases.map((p) => ({
		...p,
		inventoryItem: p.inventoryItemId ? itemsMap.get(p.inventoryItemId) : null,
	}));

	// Get unique years from purchases
	const allPurchases = await db.getPurchases();
	const years = [...new Set(allPurchases.map((p) => p.year))].sort(
		(a, b) => b - a,
	);

	// Calculate totals by status
	const totals = {
		pending: allPurchases
			.filter((p) => p.status === "pending")
			.reduce((sum, p) => sum + parseFloat(p.amount), 0),
		approved: allPurchases
			.filter((p) => p.status === "approved")
			.reduce((sum, p) => sum + parseFloat(p.amount), 0),
		reimbursed: allPurchases
			.filter((p) => p.status === "reimbursed")
			.reduce((sum, p) => sum + parseFloat(p.amount), 0),
	};

	return {
		siteConfig: SITE_CONFIG,
		purchases: enrichedPurchases,
		years,
		currentYear: parseInt(year, 10) || new Date().getFullYear(),
		currentStatus: status,
		totals,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action");
	const purchaseId = formData.get("purchaseId") as string;

	if (actionType === "updateStatus" && purchaseId) {
		// Updating status requires approve permission
		await requirePermission(request, "reimbursements:approve", getDatabase);

		const newStatus = formData.get("status") as PurchaseStatus;
		await db.updatePurchase(purchaseId, { status: newStatus });

		// Also update the linked transaction's reimbursementStatus and status
		const linkedTransaction = await db.getTransactionByPurchaseId(purchaseId);
		if (linkedTransaction) {
			// Map purchase status to transaction reimbursementStatus and status
			let newReimbursementStatus:
				| "requested"
				| "approved"
				| "declined"
				| "not_requested" = "requested";
			let newTransactionStatus: "pending" | "complete" | "paused" | "declined" =
				"pending";

			if (newStatus === "approved" || newStatus === "reimbursed") {
				newReimbursementStatus = "approved";
				newTransactionStatus = "complete";
			} else if (newStatus === "rejected") {
				newReimbursementStatus = "declined";
				newTransactionStatus = "declined";
			} else if (newStatus === "pending") {
				newReimbursementStatus = "requested";
				newTransactionStatus = "pending";
			}
			await db.updateTransaction(linkedTransaction.id, {
				reimbursementStatus: newReimbursementStatus,
				status: newTransactionStatus,
			});
		}
	} else if (actionType === "delete" && purchaseId) {
		// Deleting requires delete permission
		await requirePermission(request, "reimbursements:delete", getDatabase);
		await db.deletePurchase(purchaseId);
	}

	return { success: true };
}

// Helper for status colors - kept outside as it doesn't need translation
const statusColors = {
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
	approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	reimbursed:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
	rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function BudgetReimbursements({
	loaderData,
}: Route.ComponentProps) {
	const { purchases, years, currentYear, currentStatus, totals } = loaderData;
	const [searchParams, setSearchParams] = useSearchParams();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const isStaff =
		rootData?.user?.roleName === "Admin" ||
		rootData?.user?.roleName === "Board Member";
	const { t, i18n } = useTranslation();

	const formatCurrency = (value: number | string) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);

	const handleFilter = (key: string, value: string) => {
		const params = new URLSearchParams(searchParams);
		if (value === "all") {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		setSearchParams(params);
	};

	if (!isStaff) {
		return (
			<PageWrapper>
				<div className="p-8 text-center">
					<p className="text-gray-500">
						{t("treasury.reimbursements.access_denied")}
					</p>
				</div>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper>
			<div className="w-full max-w-5xl mx-auto px-4">
				{/* Header */}
				<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<Link
							to="/treasury"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-2"
						>
							<span className="material-symbols-outlined text-base">
								arrow_back
							</span>
							{t("treasury.reimbursements.back")}
						</Link>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("treasury.reimbursements.title")}
						</h1>
					</div>
					<Link to="/treasury/reimbursement/new">
						<Button>
							<span className="material-symbols-outlined mr-2">add</span>
							{t("treasury.reimbursements.new")}
						</Button>
					</Link>
				</div>

				{/* Summary cards */}
				<div className="grid grid-cols-3 gap-4 mb-6">
					<div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
						<p className="text-xs font-bold uppercase text-yellow-700 dark:text-yellow-300">
							{t("treasury.reimbursements.statuses.pending")}
						</p>
						<p className="text-xl font-black text-yellow-800 dark:text-yellow-200">
							{formatCurrency(totals.pending)}
						</p>
					</div>
					<div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
						<p className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300">
							{t("treasury.reimbursements.statuses.approved")}
						</p>
						<p className="text-xl font-black text-blue-800 dark:text-blue-200">
							{formatCurrency(totals.approved)}
						</p>
					</div>
					<div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
						<p className="text-xs font-bold uppercase text-green-700 dark:text-green-300">
							{t("treasury.reimbursements.statuses.reimbursed")}
						</p>
						<p className="text-xl font-black text-green-800 dark:text-green-200">
							{formatCurrency(totals.reimbursed)}
						</p>
					</div>
				</div>

				{/* Filters */}
				<div className="flex flex-wrap gap-4 mb-6">
					<div className="flex gap-2">
						<span className="text-sm text-gray-500 self-center">
							{t("treasury.reimbursements.status")}:
						</span>
						{["all", "pending", "approved", "reimbursed", "rejected"].map(
							(s) => (
								<Button
									type="button"
									key={s}
									variant={currentStatus === s ? "default" : "secondary"}
									size="sm"
									onClick={() => handleFilter("status", s)}
									className="text-xs font-bold uppercase"
								>
									{s === "all"
										? t("treasury.reimbursements.all")
										: t(`treasury.reimbursements.statuses.${s}`)}
								</Button>
							),
						)}
					</div>
					{years.length > 0 && (
						<div className="flex gap-2">
							<span className="text-sm text-gray-500 self-center">
								{t("treasury.year")}:
							</span>
							{years.map((y: number) => (
								<Button
									type="button"
									key={y}
									variant={currentYear === y ? "default" : "secondary"}
									size="sm"
									onClick={() => handleFilter("year", String(y))}
									className="text-xs font-bold"
								>
									{y}
								</Button>
							))}
						</div>
					)}
				</div>

				{/* Table */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					{purchases.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							{t("treasury.no_transactions")}
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("treasury.reimbursements.date")}</TableHead>
									<TableHead>
										{t("treasury.reimbursements.description")}
									</TableHead>
									<TableHead>
										{t("treasury.reimbursements.purchaser")}
									</TableHead>
									<TableHead>{t("treasury.reimbursements.amount")}</TableHead>
									<TableHead>{t("treasury.reimbursements.status")}</TableHead>
									<TableHead title={t("treasury.reimbursements.email_sent")}>
										📧
									</TableHead>
									<TableHead
										title={t("treasury.reimbursements.reply_received")}
									>
										💬
									</TableHead>
									<TableHead></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{purchases.map(
									(
										purchase: Purchase & {
											inventoryItem?: InventoryItem | null;
										},
									) => {
										// Use type assertion to ensure status is a valid key, fallback to pending color if not
										const statusKey =
											purchase.status as keyof typeof statusColors;
										const statusColor =
											statusColors[statusKey] || statusColors.pending;
										const displayName =
											purchase.inventoryItem?.name ||
											purchase.description ||
											"—";
										const canApprove =
											rootData?.user?.permissions?.includes(
												"reimbursements:approve",
											) || rootData?.user?.permissions?.includes("*");
										const canDelete =
											rootData?.user?.permissions?.includes(
												"reimbursements:delete",
											) || rootData?.user?.permissions?.includes("*");

										return (
											<TableRow key={purchase.id}>
												<TableCell className="font-mono text-sm">
													{formatDate(purchase.createdAt)}
												</TableCell>
												<TableCell className="font-medium max-w-[200px] truncate">
													{displayName}
												</TableCell>
												<TableCell>{purchase.purchaserName}</TableCell>
												<TableCell className="font-bold">
													{formatCurrency(purchase.amount)}
												</TableCell>
												<TableCell>
													{canApprove ? (
														<Form method="post" className="inline-block">
															<input
																type="hidden"
																name="_action"
																value="updateStatus"
															/>
															<input
																type="hidden"
																name="purchaseId"
																value={purchase.id}
															/>
															<select
																name="status"
																defaultValue={purchase.status}
																onChange={(e) => e.target.form?.requestSubmit()}
																className={`px-2 py-1 rounded text-xs font-bold cursor-pointer border-0 ${statusColor}`}
															>
																<option value="pending">
																	{t(
																		"treasury.reimbursements.statuses.pending",
																	)}
																</option>
																<option value="approved">
																	{t(
																		"treasury.reimbursements.statuses.approved",
																	)}
																</option>
																<option value="reimbursed">
																	{t(
																		"treasury.reimbursements.statuses.reimbursed",
																	)}
																</option>
																<option value="rejected">
																	{t(
																		"treasury.reimbursements.statuses.rejected",
																	)}
																</option>
															</select>
														</Form>
													) : (
														<span
															className={`px-2 py-1 rounded text-xs font-bold ${statusColor}`}
														>
															{t(
																`treasury.reimbursements.statuses.${purchase.status}`,
															)}
														</span>
													)}
												</TableCell>
												<TableCell>
													{purchase.emailSent ? (
														<span
															className="text-green-600"
															title={t("treasury.reimbursements.email_sent")}
														>
															✓
														</span>
													) : purchase.emailError ? (
														<span
															className="text-red-600"
															title={purchase.emailError}
														>
															✗
														</span>
													) : (
														<span className="text-gray-400">—</span>
													)}
												</TableCell>
												<TableCell>
													{/* Show reply indicator if email reply received */}
													{purchase.emailReplyReceived ? (
														<span
															className="text-blue-600 cursor-help"
															title={
																purchase.emailReplyContent ||
																t("treasury.reimbursements.reply_received")
															}
														>
															💬
														</span>
													) : (
														<span className="text-gray-400">—</span>
													)}
												</TableCell>
												<TableCell>
													{canDelete && (
														<Form method="post" className="inline-block">
															<input
																type="hidden"
																name="_action"
																value="delete"
															/>
															<input
																type="hidden"
																name="purchaseId"
																value={purchase.id}
															/>
															<Button
																type="submit"
																variant="ghost"
																size="icon"
																onClick={(e) => {
																	if (
																		!confirm(
																			t(
																				"treasury.reimbursements.delete_confirm",
																			),
																		)
																	) {
																		e.preventDefault();
																	}
																}}
																className="text-red-500 hover:text-red-700 h-8 w-8"
																title={t("settings.common.delete")}
															>
																<span className="material-symbols-outlined text-lg">
																	delete
																</span>
															</Button>
														</Form>
													)}
												</TableCell>
											</TableRow>
										);
									},
								)}
							</TableBody>
						</Table>
					)}
				</div>
			</div>
		</PageWrapper>
	);
}
