import {
	TableTotalsRow,
	type TableTotalsRowProps,
} from "~/components/treasury/table-totals-row";
import { EmptyState } from "~/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

/** Shared cell style constants for consistent styling across treasury tables */
export const TREASURY_TABLE_STYLES = {
	INDEX_CELL: "text-gray-500 dark:text-gray-400 text-sm font-mono",
	DATE_CELL: "font-mono text-sm",
	DESCRIPTION_CELL: "max-w-xs break-words whitespace-normal line-clamp-3",
	AMOUNT_CELL: "text-right font-bold",
	AMOUNT_EXPENSE: "text-red-600 dark:text-red-400",
	AMOUNT_INCOME: "text-green-600 dark:text-green-400",
} as const;

export interface TreasuryTableColumn<T> {
	key: string;
	header: string;
	headerClassName?: string;
	align?: "left" | "right";
	cell: (row: T, index: number) => React.ReactNode;
	cellClassName?: string | ((row: T) => string);
}

export interface TreasuryTableProps<T> {
	data: T[];
	columns: TreasuryTableColumn<T>[];
	getRowKey: (row: T) => string;
	renderActions?: (row: T, index: number) => React.ReactNode;
	emptyState?: {
		icon?: string;
		title: string;
		description?: string;
		action?: React.ReactNode;
	};
	totals?: Omit<TableTotalsRowProps, "rowCount"> & { rowCount?: number };
	actionsColumnWidth?: "w-16" | "w-20";
}

const CONTAINER_CLASS =
	"bg-card rounded-2xl shadow-sm border border-border overflow-hidden";

export function TreasuryTable<T>({
	data,
	columns,
	getRowKey,
	renderActions,
	emptyState,
	totals,
	actionsColumnWidth = "w-20",
}: TreasuryTableProps<T>) {
	const hasActions = Boolean(renderActions);
	const rowCount = data.length;

	if (rowCount === 0 && emptyState) {
		return (
			<div className={CONTAINER_CLASS}>
				<EmptyState
					message={emptyState.title}
					description={emptyState.description}
					icon={emptyState.icon}
					action={emptyState.action}
				/>
			</div>
		);
	}

	if (rowCount === 0) {
		return (
			<div className={CONTAINER_CLASS}>
				<EmptyState message={emptyState?.title ?? "No data"} />
			</div>
		);
	}

	return (
		<div className={CONTAINER_CLASS}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12">#</TableHead>
						{columns.map((col) => (
							<TableHead
								key={col.key}
								className={cn(
									col.align === "right" && "text-right",
									col.headerClassName,
								)}
							>
								{col.header}
							</TableHead>
						))}
						{hasActions && (
							<TableHead className={cn(actionsColumnWidth)}></TableHead>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((row, index) => (
						<TableRow key={getRowKey(row)}>
							<TableCell className={TREASURY_TABLE_STYLES.INDEX_CELL}>
								{index + 1}
							</TableCell>
							{columns.map((col) => {
								const cellClassName =
									typeof col.cellClassName === "function"
										? col.cellClassName(row)
										: col.cellClassName;
								return (
									<TableCell
										key={col.key}
										className={cn(
											col.align === "right" && "text-right",
											cellClassName,
										)}
									>
										{col.cell(row, index)}
									</TableCell>
								);
							})}
							{hasActions && (
								<TableCell>{renderActions?.(row, index)}</TableCell>
							)}
						</TableRow>
					))}
					{totals && <TableTotalsRow {...totals} rowCount={rowCount} />}
				</TableBody>
			</Table>
		</div>
	);
}
