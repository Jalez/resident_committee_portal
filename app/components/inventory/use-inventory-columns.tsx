import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { Form, Link } from "react-router";
import { RelationsColumn } from "~/components/relations-column";
import { Checkbox } from "~/components/ui/checkbox";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EditableCell } from "~/components/ui/editable-cell";
import type { InventoryItem } from "~/db";
import type { ColumnKey } from "./inventory-constants";

interface TransactionLink {
	transaction: { id: string; description: string; date: Date; type: string };
	quantity: number;
}

interface UseInventoryColumnsProps {
	visibleColumns: Set<ColumnKey>;
	isStaff: boolean;
	onInlineEdit: (itemId: string, field: string, value: string) => void;
	// Callbacks for unlink operations
	onUnlinkFromTransaction?: (
		itemId: string,
		transactionId: string,
		quantity: number,
	) => void;
	onReduceManualCount?: (itemId: string, quantity: number) => void;
	// Unknown badge: connect to transaction (submenu) or create new
	onSelectTransactionForItem?: (
		item: InventoryItem,
		quantity: number,
		transaction: {
			id: string;
			description: string;
			date: Date;
			amount: string;
		},
	) => void;
	onCreateNewTransaction?: (item: InventoryItem, quantity: number) => void;
	// Inventory-category transactions for the "connect to existing" submenu
	inventoryTransactions?: {
		id: string;
		description: string;
		date: Date;
		amount: string;
	}[];
	// Props for combobox options
	uniqueLocations: string[];
	uniqueCategories: string[];
	itemNames: string[];
	// Transaction links for the transactions column
	transactionLinksMap?: Record<string, TransactionLink[]>;
	relationsMap?: Record<string, RelationBadgeData[]>;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
	if (status === "removed") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
				<span className="material-symbols-outlined text-sm">delete</span>
				{/* We need useTranslation here too, but it's a component. */}
				<StatusRemovedText />
			</span>
		);
	}
	// Active - show nothing (default state)
	return null;
}

function StatusRemovedText() {
	const { t } = useTranslation();
	return <>{t("inventory.status.removed")}</>;
}

export function useInventoryColumns({
	visibleColumns,
	isStaff,
	onInlineEdit,
	onUnlinkFromTransaction,
	onReduceManualCount,
	onSelectTransactionForItem,
	onCreateNewTransaction,
	inventoryTransactions = [],
	uniqueLocations,
	uniqueCategories,
	itemNames,
	transactionLinksMap = {},
	relationsMap = {},
}: UseInventoryColumnsProps): ColumnDef<InventoryItem>[] {
	const { t, i18n } = useTranslation();

	// Build columns - order: status, name, location, category, description, updatedAt, unitValue, quantity, totalValue, showInInfoReel, actions
	const columns: ColumnDef<InventoryItem>[] = [];

	// Status column (always visible for staff)
	if (isStaff && visibleColumns.has("status")) {
		columns.push({
			accessorKey: "status",
			header: t("inventory.columns.status"),
			cell: ({ row }) => (
				<StatusBadge status={row.original.status || "active"} />
			),
		});
	}

	if (visibleColumns.has("name")) {
		columns.push({
			accessorKey: "name",
			header: t("inventory.columns.name"),
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<EditableCell
						value={row.getValue("name")}
						onSave={(v) => onInlineEdit(row.original.id, "name", v)}
						disabled={!isStaff || row.original.status === "removed"}
						items={itemNames}
					/>
					{/* Show inline status badge for removed/legacy items */}
					{row.original.status !== "active" &&
						!visibleColumns.has("status") && (
							<StatusBadge status={row.original.status || "active"} />
						)}
				</div>
			),
		});
	}

	if (visibleColumns.has("location")) {
		columns.push({
			accessorKey: "location",
			header: t("inventory.columns.location"),
			cell: ({ row }) => (
				<EditableCell
					value={row.getValue("location") || ""}
					onSave={(v) => onInlineEdit(row.original.id, "location", v)}
					disabled={!isStaff || row.original.status === "removed"}
					items={uniqueLocations}
				/>
			),
		});
	}

	if (visibleColumns.has("category")) {
		columns.push({
			accessorKey: "category",
			header: t("inventory.columns.category"),
			cell: ({ row }) => (
				<EditableCell
					value={row.getValue("category") || ""}
					onSave={(v) => onInlineEdit(row.original.id, "category", v)}
					disabled={!isStaff || row.original.status === "removed"}
					items={uniqueCategories}
				/>
			),
		});
	}

	if (visibleColumns.has("description")) {
		columns.push({
			accessorKey: "description",
			header: t("inventory.columns.description"),
			cell: ({ row }) => (
				<EditableCell
					value={row.getValue("description") || ""}
					onSave={(v) => onInlineEdit(row.original.id, "description", v)}
					disabled={!isStaff || row.original.status === "removed"}
				/>
			),
		});
	}

	if (visibleColumns.has("updatedAt")) {
		columns.push({
			accessorKey: "updatedAt",
			header: t("inventory.columns.updated"),
			cell: ({ row }) => {
				const date = new Date(row.getValue("updatedAt"));
				return (
					<span className="text-gray-500 text-xs text-nowrap">
						{date.toLocaleDateString(i18n.language)}
					</span>
				);
			},
		});
	}

	// Staff-only columns
	if (isStaff && visibleColumns.has("unitValue")) {
		columns.push({
			accessorKey: "value",
			header: t("inventory.columns.unit_value"),
			cell: ({ row }) => (
				<EditableCell
					value={(row.getValue("value") as string) || "0"}
					onSave={(v) => onInlineEdit(row.original.id, "value", v)}
					disabled={!isStaff || row.original.status === "removed"}
					type="number"
					min="0"
					step="0.01"
				/>
			),
		});
	}

	if (visibleColumns.has("quantity")) {
		columns.push({
			accessorKey: "quantity",
			header: t("inventory.columns.quantity"),
			cell: ({ row }) =>
				isStaff && row.original.status === "active" ? (
					<EditableCell
						value={String(row.getValue("quantity") ?? "")}
						onSave={(v) => onInlineEdit(row.original.id, "quantity", v || "1")}
						type="number"
						min="1"
						className="w-20 text-center"
					/>
				) : (
					<span className="text-gray-600 dark:text-gray-400">
						{row.getValue("quantity")} {t("inventory.unit")}
					</span>
				),
		});
	}

	if (isStaff && visibleColumns.has("totalValue")) {
		columns.push({
			id: "totalValue",
			header: t("inventory.columns.total_value"),
			cell: ({ row }) => {
				const value = row.original.value as string | null;
				const qty = row.original.quantity;
				if (!value || value === "0")
					return <span className="text-gray-400">-</span>;
				const total = parseFloat(value) * qty;
				return (
					<span className="font-bold text-primary">
						{total.toFixed(2).replace(".", ",")} €
					</span>
				);
			},
		});
	}

	// Transactions column (staff only)
	if (isStaff && visibleColumns.has("transactions")) {
		columns.push({
			id: "transactions",
			header: t("inventory.columns.transactions"),
			cell: ({ row }) => {
				const item = row.original;
				// If item is removed, don't show transaction breakdown? Or show it but maybe dimmed?
				// Let's show it.

				const links = transactionLinksMap[item.id] || [];
				const linkedQuantity = links.reduce(
					(sum, link) => sum + link.quantity,
					0,
				);
				// manualCount comes from schema update
				const manualQuantity = item.manualCount || 0;

				const totalQuantity = item.quantity;
				const unknownQuantity = Math.max(
					0,
					totalQuantity - linkedQuantity - manualQuantity,
				);

				if (
					linkedQuantity === 0 &&
					manualQuantity === 0 &&
					unknownQuantity === 0
				) {
					return <span className="text-gray-400 text-sm">-</span>;
				}

				return (
					<div className="flex flex-wrap gap-1">
						{/* Linked Transactions */}
						{links.map((link) => (
							<span
								key={link.transaction.id}
								className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
							>
								<Link
									to={`/treasury/transactions/${link.transaction.id}/edit`}
									className="hover:underline"
									onClick={(e) => e.stopPropagation()}
									title={link.transaction.description}
								>
									{link.transaction.id.slice(0, 8)}
								</Link>
								<span className="font-semibold">({link.quantity})</span>
								{onUnlinkFromTransaction && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onUnlinkFromTransaction(
												item.id,
												link.transaction.id,
												link.quantity,
											);
										}}
										className="ml-0.5 p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300"
										title={t("inventory.actions.unlink")}
									>
										<span
											className="material-symbols-outlined text-xs"
											style={{ fontSize: "12px" }}
										>
											delete
										</span>
									</button>
								)}
							</span>
						))}

						{/* Manual / No Transaction */}
						{manualQuantity > 0 && (
							<span
								className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
								title="Manually marked as no transaction/legacy"
							>
								no-transaction
								<span className="font-semibold">({manualQuantity})</span>
								{onReduceManualCount && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onReduceManualCount(item.id, manualQuantity);
										}}
										className="ml-0.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
										title={t("inventory.actions.remove_marker")}
									>
										<span
											className="material-symbols-outlined text-xs"
											style={{ fontSize: "12px" }}
										>
											delete
										</span>
									</button>
								)}
							</span>
						)}

						{/* Unknown / Unaccounted - clickable menu when callbacks provided */}
						{unknownQuantity > 0 &&
							(onSelectTransactionForItem || onCreateNewTransaction ? (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											onClick={(e) => e.stopPropagation()}
											className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
											title={t("inventory.badge_unknown_title")}
										>
											unknown
											<span className="ml-1 font-semibold">
												({unknownQuantity})
											</span>
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="start"
										onClick={(e) => e.stopPropagation()}
										className="max-h-[min(400px,60vh)] overflow-y-auto"
									>
										{onSelectTransactionForItem && (
											<DropdownMenuSub>
												<DropdownMenuSubTrigger
													onClick={(e) => e.stopPropagation()}
													className="gap-2"
												>
													{t("inventory.badge_connect_existing")}
												</DropdownMenuSubTrigger>
												<DropdownMenuSubContent className="max-h-[min(320px,50vh)] overflow-y-auto min-w-[220px]">
													{inventoryTransactions.length === 0 ? (
														<div className="px-2 py-3 text-sm text-muted-foreground">
															{t(
																"inventory.modals.transaction_selector.no_suitable",
															)}
														</div>
													) : (
														inventoryTransactions.map((transaction) => (
															<DropdownMenuItem
																key={transaction.id}
																onClick={(e) => {
																	e.stopPropagation();
																	onSelectTransactionForItem(
																		item,
																		unknownQuantity,
																		transaction,
																	);
																}}
																className="flex flex-col items-stretch gap-0.5 py-2"
															>
																<span className="font-medium truncate">
																	{transaction.description}
																</span>
																<span className="text-xs text-muted-foreground flex justify-between">
																	<span>
																		{new Date(
																			transaction.date,
																		).toLocaleDateString(i18n.language)}
																	</span>
																	<span className="font-mono">
																		{parseFloat(transaction.amount)
																			.toFixed(2)
																			.replace(".", ",")}{" "}
																		€
																	</span>
																</span>
															</DropdownMenuItem>
														))
													)}
												</DropdownMenuSubContent>
											</DropdownMenuSub>
										)}
										{onCreateNewTransaction && (
											<DropdownMenuItem
												onClick={(e) => {
													e.stopPropagation();
													onCreateNewTransaction(item, unknownQuantity);
												}}
											>
												{t("inventory.badge_create_new_transaction")}
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							) : (
								<span
									className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
									title="Unaccounted quantity"
								>
									unknown
									<span className="ml-1 font-semibold">
										({unknownQuantity})
									</span>
								</span>
							))}
					</div>
				);
			},
		});
	}

	columns.push({
		id: "relations",
		header: t("common.relations.title"),
		cell: ({ row }) => (
			<RelationsColumn relations={relationsMap[row.original.id] || []} />
		),
	});

	if (isStaff && visibleColumns.has("showInInfoReel")) {
		columns.push({
			accessorKey: "showInInfoReel",
			header: t("inventory.columns.info_reel"),
			cell: ({ row }) => (
				<Form
					method="post"
					className="flex justify-center"
					onClick={(e) => e.stopPropagation()}
				>
					<input type="hidden" name="_action" value="toggleInfoReel" />
					<input type="hidden" name="itemId" value={row.original.id} />
					<Checkbox
						checked={row.original.showInInfoReel}
						disabled={row.original.status !== "active"}
						onCheckedChange={() => {
							// Find the closest form and submit it
							const form = document
								.querySelector(`form input[value="${row.original.id}"]`)
								?.closest("form");
							if (form) (form as HTMLFormElement).requestSubmit();
						}}
					/>
				</Form>
			),
		});
	}

	return columns;
}
