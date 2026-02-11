import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import type { SheetData } from "~/lib/google.server";

interface AnalyticsTableProps {
	sheetData: SheetData;
	currentPage: number;
	pageSize: number;
	filters: Record<string, string>;
	columnUniqueValues: Record<string, string[]>;
	activeChartColumn: number;
	onColumnSelect: (index: number) => void;
	hiddenQuestions?: string[];
}

export function AnalyticsTable({
	sheetData,
	currentPage,
	pageSize,
	filters,
	columnUniqueValues,
	activeChartColumn,
	onColumnSelect,
	hiddenQuestions = [],
}: AnalyticsTableProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [visibleColumns, setVisibleColumns] = useState<Set<number>>(new Set());

	// Initialize/Reset visible columns when headers change
	// Exclude columns that match hidden questions
	useEffect(() => {
		if (sheetData?.headers) {
			const hiddenSet = new Set(hiddenQuestions.map((q) => q.toLowerCase()));
			const visible = sheetData.headers
				.map((header, i) => ({ header, i }))
				.filter(({ header }) => !hiddenSet.has(header.toLowerCase()))
				.map(({ i }) => i);
			setVisibleColumns(new Set(visible));
		}
	}, [
		sheetData?.headers.length,
		hiddenQuestions,
		sheetData.headers.map,
		sheetData?.headers,
	]);

	// Toggle column visibility
	const toggleColumnVisibility = (index: number) => {
		setVisibleColumns((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(index)) {
				newSet.delete(index);
			} else {
				newSet.add(index);
			}
			return newSet;
		});
	};

	// Handle page change
	const handlePageChange = (page: number) => {
		const params = new URLSearchParams(searchParams);
		params.set("page", page.toString());
		setSearchParams(params);
	};

	// Handle filter change
	const handleFilterChange = (columnIndex: number, value: string) => {
		const params = new URLSearchParams(searchParams);
		if (value && value !== "all") {
			params.set(`col_${columnIndex}`, value);
		} else {
			params.delete(`col_${columnIndex}`);
		}
		params.set("page", "1");
		setSearchParams(params);
	};

	const totalPages = Math.ceil(sheetData.totalRows / pageSize);

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex justify-end">
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm">
							<span className="material-symbols-outlined text-base mr-1">
								view_column
							</span>
							Columns
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80 max-h-96 overflow-y-auto">
						<div className="space-y-2">
							<h4 className="font-medium text-sm mb-3">Visible Columns</h4>
							{sheetData.headers.map((header, index) => (
								<div key={index} className="flex items-center gap-2">
									<Checkbox
										id={`col-${index}`}
										checked={visibleColumns.has(index)}
										onCheckedChange={() => toggleColumnVisibility(index)}
									/>
									<label
										htmlFor={`col-${index}`}
										className="text-sm cursor-pointer flex-1 truncate"
										title={header}
									>
										<span className="font-medium text-indigo-600">
											Q{index + 1}
										</span>
										<span className="text-gray-500 ml-2">
											{header.slice(0, 40)}
											{header.length > 40 ? "..." : ""}
										</span>
									</label>
								</div>
							))}
						</div>
					</PopoverContent>
				</Popover>
			</div>

			{/* Table */}
			<div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
				<TooltipProvider>
					<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead className="bg-gray-50 dark:bg-gray-900">
							<tr>
								{sheetData.headers.map((header, index) => {
									if (!visibleColumns.has(index)) return null;

									const isActive = activeChartColumn === index;
									const uniqueValues = columnUniqueValues[header] || [];
									const useDropdown =
										uniqueValues.length > 0 && uniqueValues.length <= 15;

									return (
										<th
											key={index}
											className={`px-3 py-3 text-left transition-colors border-b-2
                                                ${isActive ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20" : "border-transparent"}
                                            `}
										>
											<div className="flex flex-col gap-2 min-w-[140px]">
												{/* Header Title (Clickable) */}
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															onClick={() => onColumnSelect(index)}
															className={`text-xs font-medium uppercase tracking-wider text-left transition-colors
                                                                ${isActive ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}
                                                            `}
														>
															Q{index + 1}
															{isActive && (
																<span className="ml-1 text-[10px] align-top bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1 rounded">
																	CHART
																</span>
															)}
														</button>
													</TooltipTrigger>
													<TooltipContent side="top" className="max-w-sm">
														<p className="text-sm font-semibold mb-1">
															Q{index + 1}: Click to visualize
														</p>
														<p className="text-sm">{header}</p>
													</TooltipContent>
												</Tooltip>

												{/* Filter Input */}
												{useDropdown ? (
													<Select
														value={filters[header] || "all"}
														onValueChange={(value) =>
															handleFilterChange(index, value)
														}
													>
														<SelectTrigger className="h-7 text-xs px-2 w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
															<SelectValue placeholder="All" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="all">All</SelectItem>
															{uniqueValues.map((val) => (
																<SelectItem key={val} value={val}>
																	{val.slice(0, 20)}
																	{val.length > 20 ? "..." : ""}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												) : (
													<Input
														placeholder="Filter..."
														className="h-7 text-xs px-2 w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
														defaultValue={filters[header] || ""}
														onChange={(e) =>
															handleFilterChange(index, e.target.value)
														}
													/>
												)}
											</div>
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
							{sheetData.rows.map((row, rowIndex) => (
								<tr
									key={rowIndex}
									className="hover:bg-gray-50 dark:hover:bg-gray-700"
								>
									{sheetData.headers.map((header, colIndex) => {
										if (!visibleColumns.has(colIndex)) return null;
										return (
											<td
												key={colIndex}
												className={`px-3 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate
                                                    ${activeChartColumn === colIndex ? "bg-indigo-50/30 dark:bg-indigo-900/10" : ""}
                                                `}
												title={row[header] || ""}
											>
												{row[header] || "-"}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</TooltipProvider>

				{/* Pagination */}
				<div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
					<span className="text-sm text-gray-500">
						{sheetData.totalRows} total rows • Page {currentPage} of{" "}
						{totalPages}
					</span>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage <= 1}
							onClick={() => handlePageChange(currentPage - 1)}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage >= totalPages}
							onClick={() => handlePageChange(currentPage + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
