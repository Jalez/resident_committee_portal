import { useTranslation } from "react-i18next";
import { TableCell, TableRow } from "~/components/ui/table";

interface TotalsColumn {
	/** The value to sum */
	value: number;
	/** Optional: if this is a transaction type, subtract expenses instead of adding */
	type?: "income" | "expense";
}

interface TableTotalsRowProps {
	/** Number of columns before the summable columns */
	labelColSpan: number;
	/** Columns to sum */
	columns: TotalsColumn[];
	/** Number of columns between summable columns (e.g., Status, Date between Used/Remaining and Amount) */
	middleColSpan?: number;
	/** Number of columns after the summable columns (e.g., actions column) */
	trailingColSpan?: number;
	/** Custom formatter for currency values */
	formatCurrency: (value: number) => string;
	/** Optional: show totals only if there are rows */
	showOnlyIfRows?: boolean;
	/** Number of data rows */
	rowCount?: number;
}

export function TableTotalsRow({
	labelColSpan,
	columns,
	middleColSpan = 0,
	trailingColSpan = 0,
	formatCurrency,
	showOnlyIfRows = true,
	rowCount = 0,
}: TableTotalsRowProps) {
	const { t } = useTranslation();

	if (showOnlyIfRows && rowCount === 0) {
		return null;
	}

	// Sum all columns, handling transaction types
	const totals = columns.reduce((acc, col) => {
		if (col.type) {
			// Handle transaction types: income adds, expense subtracts
			const adjustedValue = col.type === "expense" ? -col.value : col.value;
			return acc + adjustedValue;
		}
		// Simple sum for non-transaction columns
		return acc + col.value;
	}, 0);

	// If columns is an array of individual values (for multiple summable columns)
	// Otherwise, it's a single total value
	const isMultipleColumns = columns.length > 1;
	
	if (isMultipleColumns) {
		// Multiple columns: sum each column separately
		const columnTotals = columns.map((col) => {
			if (col.type) {
				return col.type === "expense" ? -col.value : col.value;
			}
			return col.value;
		});
		
		// Split columns into first set and last column if there's a middle gap
		const hasMiddleGap = middleColSpan > 0 && columnTotals.length > 1;
		const firstColumns = hasMiddleGap ? columnTotals.slice(0, -1) : columnTotals;
		const lastColumn = hasMiddleGap ? columnTotals[columnTotals.length - 1] : null;
		
		return (
			<TableRow className="bg-gray-50 dark:bg-gray-900/50 border-t-2 border-gray-200 dark:border-gray-700">
				<TableCell colSpan={labelColSpan} className="font-bold">
					{t("common.total")}
				</TableCell>
				{firstColumns.map((total, index) => {
					const cellKey = `total-col-${index}`;
					return (
						<TableCell
							key={cellKey}
							className="font-bold"
						>
							{formatCurrency(total)}
						</TableCell>
					);
				})}
				{middleColSpan > 0 && (
					<TableCell colSpan={middleColSpan}></TableCell>
				)}
				{lastColumn !== null && (
					<TableCell className="text-right font-bold">
						{formatCurrency(lastColumn)}
					</TableCell>
				)}
				{trailingColSpan > 0 && (
					<TableCell colSpan={trailingColSpan}></TableCell>
				)}
			</TableRow>
		);
	}
	
	// Single column: sum all values
	const total = totals;
	
	return (
		<TableRow className="bg-gray-50 dark:bg-gray-900/50 border-t-2 border-gray-200 dark:border-gray-700">
			<TableCell colSpan={labelColSpan} className="font-bold">
				{t("common.total")}
			</TableCell>
			<TableCell className="text-right font-bold">
				{formatCurrency(total)}
			</TableCell>
			{trailingColSpan > 0 && (
				<TableCell colSpan={trailingColSpan}></TableCell>
			)}
		</TableRow>
	);
}
