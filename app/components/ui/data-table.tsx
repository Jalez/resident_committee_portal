"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type RowSelectionState,
	useReactTable,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	pageSize?: number;
	isLoading?: boolean;
	totalCount?: number;
	currentPage?: number;
	onPageChange?: (page: number) => void;
	filterComponent?: React.ReactNode;
	enableRowSelection?: boolean;
	onDeleteSelected?: (selectedIds: string[]) => void;
	getRowId?: (row: TData, index: number, parent?: unknown) => string;
	actionsComponent?: React.ReactNode;
	onSelectionChange?: (selectedIds: string[]) => void;
	prependedRow?: React.ReactNode;
	selectedIds?: string[];
	/** Custom actions to show on the left side of selection bar (replaces text) */
	selectionActions?: React.ReactNode;
	/** Base path for generic view/edit selection actions (e.g. "/inventory") */
	basePath?: string;
	/** Whether the current user can edit (shows edit button in generic selection actions) */
	canEdit?: boolean;
	/** Max height for table body (enables scrolling). e.g. "500px" or "calc(100vh - 300px)" */
	maxBodyHeight?: string;
	/** Optional translation texts for the delete confirmation dialog */
	deleteConfirmTitle?: string;
	deleteConfirmDesc?: string;
	deleteConfirmLabel?: string;
	deleteCancelLabel?: string;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	pageSize = 20,
	isLoading = false,
	totalCount,
	currentPage = 1,
	onPageChange,
	filterComponent,
	enableRowSelection = false,
	onDeleteSelected,
	getRowId,
	actionsComponent,
	onSelectionChange,
	prependedRow,
	selectedIds: controlledSelectedIds,
	maxBodyHeight,
	selectionActions,
	basePath,
	canEdit,
	deleteConfirmTitle,
	deleteConfirmDesc,
	deleteConfirmLabel,
	deleteCancelLabel,
}: DataTableProps<TData, TValue>) {
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const { t } = useTranslation();

	// Sync rowSelection when controlledSelectedIds changes
	useEffect(() => {
		if (controlledSelectedIds) {
			const newSelection: RowSelectionState = {};
			for (const id of controlledSelectedIds) {
				newSelection[id] = true;
			}
			setRowSelection(newSelection);
		}
	}, [controlledSelectedIds]);

	// Add selection column if enabled
	const columnsWithSelection: ColumnDef<TData, TValue>[] = enableRowSelection
		? [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						type="button"
						checked={
							table.getIsAllPageRowsSelected() ||
							(table.getIsSomePageRowsSelected() && "indeterminate")
						}
						onCheckedChange={(value) =>
							table.toggleAllPageRowsSelected(!!value)
						}
						aria-label="Select all"
						onClick={(e) => e.stopPropagation()}
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						type="button"
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
						onClick={(e) => e.stopPropagation()}
					/>
				),
				enableSorting: false,
				enableHiding: false,
			},
			...columns,
		]
		: columns;

	const table = useReactTable({
		data,
		columns: columnsWithSelection,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		pageCount: totalCount ? Math.ceil(totalCount / pageSize) : -1,
		enableRowSelection,
		onRowSelectionChange: setRowSelection,
		state: {
			rowSelection,
		},
		getRowId,
	});

	const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;
	const selectedCount = Object.keys(rowSelection).length;
	const selectedIds = Object.keys(rowSelection);

	// Track previous selection to avoid infinite loops
	const prevSelectionRef = useRef<string[]>([]);
	useEffect(() => {
		const currentIds = Object.keys(rowSelection);
		const prevIds = prevSelectionRef.current;
		if (
			currentIds.length !== prevIds.length ||
			!currentIds.every((id) => prevIds.includes(id))
		) {
			prevSelectionRef.current = currentIds;
			onSelectionChange?.(currentIds);
		}
	}, [rowSelection, onSelectionChange]);

	const handleDeleteSelected = () => {
		if (selectedCount > 0 && onDeleteSelected) {
			setShowDeleteConfirm(true);
		}
	};

	const confirmDelete = () => {
		if (selectedCount > 0 && onDeleteSelected) {
			onDeleteSelected(selectedIds);
			setRowSelection({});
			setShowDeleteConfirm(false);
		}
	};

	return (
		<div className="space-y-4">
			{/* Filter controls */}
			{filterComponent && (
				<div className="bg-card rounded-xl p-4 border border-border">
					{filterComponent}
				</div>
			)}

			{/* Batch actions bar */}
			{enableRowSelection && (
				<div className="flex flex- gap-2 md:flex-row md:items-center md:justify-between">
					<div className="flex items-center gap-2">
						{onDeleteSelected && (
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={handleDeleteSelected}
								disabled={selectedCount === 0}
							>
								<span className="material-symbols-outlined text-base mr-1">
									delete
								</span>
								Poista / Delete
							</Button>
						)}
						{actionsComponent}
					</div>
					{selectedCount > 0 &&
						(selectionActions ? (
							selectionActions
						) : selectedCount === 1 && basePath ? (
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									asChild
									className="hidden sm:flex"
								>
									<Link to={`${basePath}/${selectedIds[0]}`}>
										<span className="material-symbols-outlined text-base mr-1">
											visibility
										</span>
										{t("common.actions.view")}
									</Link>
								</Button>
								{canEdit && (
									<Button
										variant="outline"
										size="sm"
										asChild
										className="hidden sm:flex"
									>
										<Link to={`${basePath}/${selectedIds[0]}/edit`}>
											<span className="material-symbols-outlined text-base mr-1">
												edit
											</span>
											{t("common.actions.edit")}
										</Link>
									</Button>
								)}
							</div>
						) : (
							<span>
								{selectedCount} {t("common.selected", { defaultValue: "valittu / selected" })}
							</span>
						))}
				</div>
			)}

			{/* Table */}
			<div className="bg-card rounded-xl border border-border overflow-hidden">
				<div
					className={maxBodyHeight ? "overflow-auto" : ""}
					style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
				>
					<table className="w-full caption-bottom text-sm">
						<TableHeader className="sticky top-0 bg-card z-10">
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow key={headerGroup.id}>
									{headerGroup.headers.map((header) => (
										<TableHead key={header.id}>
											{header.isPlaceholder
												? null
												: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{prependedRow}
							{table.getRowModel().rows?.length ? (
								table.getRowModel().rows.map((row) => (
									<TableRow
										key={row.id}
										data-state={row.getIsSelected() && "selected"}
										className={`${row.getIsSelected() ? "bg-primary/5" : ""} ${enableRowSelection ? "cursor-pointer" : ""}`}
										onClick={
											enableRowSelection
												? () => row.toggleSelected()
												: undefined
										}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={columnsWithSelection.length}
										className="h-24 text-center text-muted-foreground"
									>
										Ei tuloksia / No results
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</table>
				</div>
			</div>

			<ConfirmDialog
				open={showDeleteConfirm}
				onOpenChange={setShowDeleteConfirm}
				title={deleteConfirmTitle || t("common.modals.confirm_delete_title")}
				description={
					deleteConfirmDesc ||
					t("common.modals.confirm_delete_desc", { count: selectedCount })
				}
				confirmLabel={deleteConfirmLabel || t("common.actions.delete")}
				cancelLabel={deleteCancelLabel || t("common.actions.cancel")}
				variant="destructive"
				onConfirm={confirmDelete}
			/>

			{/* Pagination */}
			{totalCount
				? totalCount > pageSize && (
					<div className="flex items-center justify-between px-2">
						<p className="text-sm text-muted-foreground">
							Sivu {currentPage} / {totalPages} ({totalCount} yhteensä)
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onPageChange?.(currentPage - 1)}
								disabled={currentPage <= 1 || isLoading}
							>
								<span className="material-symbols-outlined text-base">
									chevron_left
								</span>
								Edellinen
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onPageChange?.(currentPage + 1)}
								disabled={currentPage >= totalPages || isLoading}
							>
								Seuraava
								<span className="material-symbols-outlined text-base">
									chevron_right
								</span>
							</Button>
						</div>
					</div>
				)
				: null}
		</div>
	);
}
