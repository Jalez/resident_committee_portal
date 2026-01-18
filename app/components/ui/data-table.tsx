"use client"

import {
    type ColumnDef,
    type RowSelectionState,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table"
import { useState, useEffect, useRef } from "react"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { Checkbox } from "~/components/ui/checkbox"

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    pageSize?: number
    isLoading?: boolean
    totalCount?: number
    currentPage?: number
    onPageChange?: (page: number) => void
    filterComponent?: React.ReactNode
    enableRowSelection?: boolean
    onDeleteSelected?: (selectedIds: string[]) => void
    getRowId?: (row: TData) => string
    actionsComponent?: React.ReactNode
    onSelectionChange?: (selectedIds: string[]) => void
    prependedRow?: React.ReactNode
    selectedIds?: string[]
    /** Custom actions to show on the left side of selection bar (replaces text) */
    selectionActions?: React.ReactNode
    /** Max height for table body (enables scrolling). e.g. "500px" or "calc(100vh - 300px)" */
    maxBodyHeight?: string
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
}: DataTableProps<TData, TValue>) {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

    // Sync rowSelection when controlledSelectedIds changes
    useEffect(() => {
        if (controlledSelectedIds) {
            const newSelection = controlledSelectedIds.reduce((acc, id) => ({ ...acc, [id]: true }), {} as RowSelectionState)
            setRowSelection(newSelection)
        }
    }, [controlledSelectedIds])

    // Add selection column if enabled
    const columnsWithSelection: ColumnDef<TData, TValue>[] = enableRowSelection
        ? [
            {
                id: "select",
                header: ({ table }) => (
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                ),
                enableSorting: false,
                enableHiding: false,
            },
            ...columns,
        ]
        : columns

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
        getRowId: getRowId as any,
    })

    const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1
    const selectedCount = Object.keys(rowSelection).length
    const selectedIds = Object.keys(rowSelection)

    // Track previous selection to avoid infinite loops
    const prevSelectionRef = useRef<string[]>([])
    useEffect(() => {
        const currentIds = Object.keys(rowSelection)
        const prevIds = prevSelectionRef.current
        if (currentIds.length !== prevIds.length || !currentIds.every(id => prevIds.includes(id))) {
            prevSelectionRef.current = currentIds
            onSelectionChange?.(currentIds)
        }
    }, [rowSelection])

    const skeletonRows = Array.from({ length: Math.min(pageSize, 5) })

    const handleDeleteSelected = () => {
        if (selectedCount > 0 && onDeleteSelected) {
            onDeleteSelected(selectedIds)
            setRowSelection({})
        }
    }

    return (
        <div className="space-y-4">
            {/* Filter controls */}
            {filterComponent && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    {filterComponent}
                </div>
            )}

            {/* Batch actions bar */}
            {enableRowSelection && (
                <div className="flex flex- gap-2 md:flex-row md:items-center md:justify-between">


                    <div className="flex items-center gap-2">
                        {onDeleteSelected && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteSelected}
                                disabled={selectedCount === 0}
                            >
                                <span className="material-symbols-outlined text-base mr-1">delete</span>
                                Poista / Delete
                            </Button>
                        )}
                        {actionsComponent}
                    </div>
                    {selectedCount > 0 && (
                        selectionActions ? (
                            selectionActions
                        ) : (
                            <span>{selectedCount} valittu / selected</span>
                        )
                    )}
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className={maxBodyHeight ? "overflow-auto" : ""} style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}>
                    <table className="w-full caption-bottom text-sm">
                        <TableHeader className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
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
                                        onClick={enableRowSelection ? () => row.toggleSelected() : undefined}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columnsWithSelection.length}
                                        className="h-24 text-center text-gray-500"
                                    >
                                        Ei tuloksia / No results
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {totalCount ? totalCount > pageSize && (
                <div className="flex items-center justify-between px-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sivu {currentPage} / {totalPages} ({totalCount} yhteensä)
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange?.(currentPage - 1)}
                            disabled={currentPage <= 1 || isLoading}
                        >
                            <span className="material-symbols-outlined text-base">chevron_left</span>
                            Edellinen
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange?.(currentPage + 1)}
                            disabled={currentPage >= totalPages || isLoading}
                        >
                            Seuraava
                            <span className="material-symbols-outlined text-base">chevron_right</span>
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
