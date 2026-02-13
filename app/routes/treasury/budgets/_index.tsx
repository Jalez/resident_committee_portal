import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import {
	ColoredStatusLinkBadge,
	TREASURY_BUDGET_STATUS_VARIANTS,
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { TreasuryActionCell } from "~/components/treasury/treasury-action-cell";
import { TreasuryStatusPill } from "~/components/treasury/treasury-status-pill";
import {
	TREASURY_TABLE_STYLES,
	TreasuryTable,
} from "~/components/treasury/treasury-table";
import { ViewScopeDisclaimer } from "~/components/treasury/view-scope-disclaimer";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import {
	type AuthenticatedUser,
	getAuthenticatedUser,
	getGuestContext,
	hasAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const year = data?.selectedYear ? ` ${data.selectedYear}` : "";
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Budjetit${year} / Budgets${year}`,
		},
		{
			name: "description",
			content: "Fund budgets management / Budjettien hallinta",
		},
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	let permissions: string[];
	let languages: { primary: string; secondary: string };
	let userId: string | null = null;

	if (authUser) {
		permissions = authUser.permissions;
		languages = {
			primary: authUser.primaryLanguage,
			secondary: authUser.secondaryLanguage,
		};
		userId = authUser.userId;
	} else {
		const guestContext = await getGuestContext(() => getDatabase());
		permissions = guestContext.permissions;
		languages = guestContext.languages;
	}

	const canRead = permissions.some(
		(p) =>
			p === "treasury:budgets:read" ||
			p === "treasury:budgets:read-self" ||
			p === "*",
	);
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check if user can read all budgets or only their own
	let canReadAll = false;
	if (authUser) {
		canReadAll = hasAnyPermission(authUser as AuthenticatedUser, [
			"treasury:budgets:read",
		]);
	} else {
		// Guest users can't read all
		canReadAll = false;
	}

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const statusParam = url.searchParams.get("status") || "all";

	// Get current year
	const currentRealYear = new Date().getFullYear();
	const selectedYear = yearParam
		? Number.parseInt(yearParam, 10)
		: currentRealYear;

	// Get budgets for the year
	let budgets = await db.getFundBudgetsByYear(selectedYear);

	// Filter budgets: if user only has read-self, show only their own budgets
	if (!canReadAll && userId) {
		budgets = budgets.filter((b) => b.createdBy === userId);
	}

	// Filter by status if specified
	if (statusParam !== "all") {
		budgets = budgets.filter((r) => r.status === statusParam);
	}

	// Calculate used/reserved amounts and fetch linked transactions for each budget
	const budgetsWithUsage = await Promise.all(
		budgets.map(async (budget) => {
			const usedAmount = await db.getBudgetUsedAmount(budget.id);
			const reservedAmount = await db.getBudgetReservedAmount(budget.id);
			// Get linked transactions via entity relationships
			const budgetRelationships = await db.getEntityRelationships(
				"budget",
				budget.id,
			);
			const linkedTransactionIds = budgetRelationships
				.filter((r) => r.relationBType === "transaction")
				.map((r) => r.relationBId);
			const linkedTransactions = await Promise.all(
				linkedTransactionIds.map(async (id) => {
					const transaction = await db.getTransactionById(id);
					return transaction ? { transaction } : null;
				}),
			).then((results) =>
				results.filter(
					(t): t is { transaction: NonNullable<typeof t>["transaction"] } =>
						t !== null,
				),
			);
			return {
				...budget,
				usedAmount,
				reservedAmount,
				remainingAmount:
					Number.parseFloat(budget.amount) - usedAmount - reservedAmount,
				linkedTransactions,
			};
		}),
	);

	// Get all years with budgets for the dropdown
	const allBudgets = await db.getFundBudgets();
	const budgetYears = [...new Set(allBudgets.map((r) => r.year))].sort(
		(a, b) => b - a,
	);

	// Add current year if not in the list
	if (!budgetYears.includes(currentRealYear)) {
		budgetYears.unshift(currentRealYear);
		budgetYears.sort((a, b) => b - a);
	}

	// Get unique status for SearchMenu
	const uniqueStatuses = [...new Set(allBudgets.map((r) => r.status))];

	// Batch resolve creator names
	const creatorIds = [
		...new Set(
			budgetsWithUsage
				.map((r) => r.createdBy)
				.filter((id): id is string => Boolean(id)),
		),
	];
	const creatorUsers = await Promise.all(
		creatorIds.map((id) => db.findUserById(id)),
	);
	const creatorsMap = new Map<string, string>();
	creatorIds.forEach((id, i) => {
		if (creatorUsers[i]) creatorsMap.set(id, creatorUsers[i].name);
	});

	return {
		siteConfig: SITE_CONFIG,
		selectedYear,
		budgets: budgetsWithUsage,
		years: budgetYears,
		status: uniqueStatuses,
		languages,
		userId,
		canReadAll,
		creatorsMap: Object.fromEntries(creatorsMap),
	};
}

export default function TreasuryBudgets({ loaderData }: Route.ComponentProps) {
	const {
		selectedYear,
		budgets,
		years,
		status,
		languages,
		creatorsMap: creatorsMapRaw,
		canReadAll,
	} = loaderData;
	const creatorsMap = new Map(
		Object.entries(creatorsMapRaw ?? {}) as [string, string][],
	);
	const { hasPermission, user } = useUser();
	const canWrite = hasPermission("treasury:budgets:write");
	const canUpdateBudget = (budget: (typeof budgets)[0]) =>
		hasPermission("treasury:budgets:update") ||
		(hasPermission("treasury:budgets:update-self") &&
			budget.createdBy &&
			user?.userId === budget.createdBy);

	const canDeleteBudget = (budget: (typeof budgets)[0]) => {
		const canDelete =
			hasPermission("treasury:budgets:delete") ||
			(hasPermission("treasury:budgets:delete-self") &&
				budget.createdBy &&
				user?.userId === budget.createdBy);
		// Only allow delete when no linked transactions (usedAmount === 0)
		return canDelete && budget.usedAmount === 0;
	};
	const { t, i18n } = useTranslation();
	const [searchParams, setSearchParams] = useSearchParams();

	// Handle success/error toast messages
	useEffect(() => {
		const success = searchParams.get("success");
		if (success) {
			const successMessages: Record<string, string> = {
				created: "treasury.budgets.success.created",
				updated: "treasury.budgets.success.updated",
				deleted: "treasury.budgets.success.deleted",
				closed: "treasury.budgets.success.closed",
				reopened: "treasury.budgets.success.reopened",
			};
			toast.success(t(successMessages[success] || success));
			const nextParams = new URLSearchParams(searchParams);
			nextParams.delete("success");
			setSearchParams(nextParams, { replace: true });
		}

		const error = searchParams.get("error");
		if (error) {
			const errorMessages: Record<string, string> = {
				has_transactions: "treasury.budgets.error.has_transactions",
				delete_failed: "treasury.budgets.error.delete_failed",
			};
			toast.error(t(errorMessages[error] || error));
			const nextParams = new URLSearchParams(searchParams);
			nextParams.delete("error");
			setSearchParams(nextParams, { replace: true });
		}
	}, [searchParams, setSearchParams, t]);

	const formatCurrency = (value: number) => {
		return `${value.toFixed(2).replace(".", ",")} €`;
	};

	const formatDate = (date: Date | string) => {
		return new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);
	};

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "year",
			label: t("treasury.budgets.year"),
			type: "select",
			placeholder: t("treasury.select_year"),
			options: years.map(String),
		},
		{
			name: "status",
			label: t("common.fields.status"),
			type: "select",
			placeholder: t("common.actions.all"),
			options: ["all", ...status],
		},
	];

	const FooterContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
			{canWrite && (
				<AddItemButton
					title={t("treasury.budgets.new")}
					variant="icon"
					createType="budget"
				/>
			)}
		</div>
	);

	type BudgetRow = (typeof budgets)[0];

	// Canonical treasury column order: Date, Name/Description, Category, Type, Status, Created by, [route-specific], Amount
	const columns = [
		{
			key: "date",
			header: t("common.fields.date"),
			cell: (row: BudgetRow) => formatDate(row.createdAt),
			cellClassName: TREASURY_TABLE_STYLES.DATE_CELL,
		},
		{
			key: "name",
			header: t("treasury.budgets.name"),
			cell: (row: BudgetRow) => <p className="font-medium">{row.name}</p>,
		},
		{
			key: "description",
			header: t("treasury.budgets.description"),
			cell: (row: BudgetRow) =>
				row.description ? (
					<p className="text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
						{row.description}
					</p>
				) : (
					"—"
				),
			cellClassName: "text-gray-500 dark:text-gray-400",
		},
		{
			key: "status",
			header: t("common.fields.status"),
			cell: (row: BudgetRow) => (
				<TreasuryStatusPill
					value={row.status}
					variantMap={TREASURY_BUDGET_STATUS_VARIANTS}
					label={t(`treasury.budgets.status.${row.status}`)}
				/>
			),
		},
		{
			key: "createdBy",
			header: t("treasury.budgets.created_by"),
			cell: (row: BudgetRow) =>
				row.createdBy ? (creatorsMap.get(row.createdBy) ?? "—") : "—",
			cellClassName: "text-gray-500 dark:text-gray-400",
		},
		{
			key: "transaction",
			header: t("treasury.reimbursements.transaction"),
			cell: (row: BudgetRow) =>
				row.linkedTransactions && row.linkedTransactions.length > 0 ? (
					<div className="flex flex-col gap-0.5">
						{row.linkedTransactions
							.filter(({ transaction }) => transaction.status !== "declined")
							.map(({ transaction }) => (
								<ColoredStatusLinkBadge
									key={transaction.id}
									to={`/treasury/transactions/${transaction.id}`}
									title={t("treasury.reimbursements.view_transaction")}
									status={transaction.status}
									id={transaction.id}
									icon="link"
									variantMap={TREASURY_TRANSACTION_STATUS_VARIANTS}
								/>
							))}
					</div>
				) : (
					<span className="text-gray-400">—</span>
				),
		},
		{
			key: "used",
			header: t("treasury.budgets.used"),
			cell: (row: BudgetRow) => formatCurrency(row.usedAmount),
			cellClassName: "text-gray-600 dark:text-gray-400",
		},
		{
			key: "reserved",
			header: t("treasury.budgets.reserved"),
			cell: (row: BudgetRow) => formatCurrency(row.reservedAmount),
			cellClassName: "text-yellow-600 dark:text-yellow-400",
		},
		{
			key: "remaining",
			header: t("treasury.budgets.remaining"),
			cell: (row: BudgetRow) => formatCurrency(row.remainingAmount),
			cellClassName: (row: BudgetRow) =>
				`font-semibold ${row.remainingAmount > 0
					? "text-green-600 dark:text-green-400"
					: "text-gray-500"
				}`,
		},
		{
			key: "amount",
			header: t("treasury.budgets.amount"),
			headerClassName: "text-right",
			align: "right" as const,
			cell: (row: BudgetRow) => formatCurrency(Number.parseFloat(row.amount)),
			cellClassName: TREASURY_TABLE_STYLES.AMOUNT_CELL,
		},
	];

	return (
		<PageWrapper>
			<SplitLayout
				footer={FooterContent}
				header={{
					primary: t("treasury.budgets.title", { lng: languages.primary }),
					secondary: t("treasury.budgets.title", {
						lng: languages.secondary,
					}),
				}}
			>
				<div className="space-y-6">
					<ViewScopeDisclaimer canReadAll={canReadAll} itemType="budgets" />
					<TreasuryTable<BudgetRow>
						data={budgets}
						columns={columns}
						getRowKey={(row) => row.id}
						renderActions={(budget) => (
							<TreasuryActionCell
								viewTo={`/treasury/budgets/${budget.id}`}
								viewTitle={t("common.actions.view")}
								editTo={`/treasury/budgets/${budget.id}/edit`}
								editTitle={t("common.actions.edit")}
								canEdit={Boolean(canUpdateBudget(budget))}
								deleteProps={
									canDeleteBudget(budget)
										? {
											action: `/treasury/budgets/${budget.id}/delete`,
											hiddenFields: {},
											confirmMessage: t("treasury.budgets.delete_confirm"),
											title: t("common.actions.delete"),
										}
										: undefined
								}
							/>
						)}
						emptyState={{
							icon: "savings",
							title: t("treasury.budgets.no_budgets"),
							description: t("treasury.budgets.no_budgets_desc", {
								year: selectedYear,
							}),
							action: canWrite ? (
								<AddItemButton
									title={t("treasury.budgets.new")}
									variant="button"
									createType="budget"
								/>
							) : undefined,
						}}
						totals={{
							labelColSpan: 7,
							columns: [
								{
									value: budgets.reduce((sum, r) => sum + r.usedAmount, 0),
								},
								{
									value: budgets.reduce((sum, r) => sum + r.reservedAmount, 0),
								},
								{
									value: budgets.reduce((sum, r) => sum + r.remainingAmount, 0),
								},
								{
									value: budgets.reduce(
										(sum, r) => sum + Number.parseFloat(r.amount),
										0,
									),
								},
							],
							middleColSpan: 0,
							trailingColSpan: 1,
							formatCurrency,
						}}
						actionsColumnWidth="w-16"
					/>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
