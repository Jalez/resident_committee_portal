import { useEffect, useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Pie,
	PieChart,
	Tooltip as RechartsTooltip,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { SheetData as BaseSheetData } from "~/lib/google.server";
import { cn } from "~/lib/utils";

const CHART_COLORS = [
	"#6366f1", // indigo
	"#f59e0b", // amber
	"#10b981", // emerald
	"#ef4444", // red
	"#8b5cf6", // violet
	"#06b6d4", // cyan
	"#f97316", // orange
	"#84cc16", // lime
	"#ec4899", // pink
	"#14b8a6", // teal
];

interface SheetData extends BaseSheetData {
	allRows?: Record<string, string>[];
}

interface AnalyticsChartProps {
	sheetData: SheetData | null;
	selectedColumnIndex?: number;
}

export function AnalyticsChart({
	sheetData,
	selectedColumnIndex = 0,
}: AnalyticsChartProps) {
	const [chartType, setChartType] = useState<"pie" | "bar">("pie");
	const [aiData, setAiData] = useState<Array<{
		name: string;
		value: number;
	}> | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isDesktop, setIsDesktop] = useState(true);

	// Reset AI data when column changes
	useEffect(() => {
		setAiData(null);
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const mediaQuery = window.matchMedia("(min-width: 768px)");
		const handleChange = () => setIsDesktop(mediaQuery.matches);
		handleChange();
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	// Generate chart data from selected column
	const chartData = useMemo(() => {
		if (aiData) return aiData;
		if (!sheetData?.allRows || selectedColumnIndex >= sheetData.headers.length)
			return [];

		const header = sheetData.headers[selectedColumnIndex];
		const counts: Record<string, number> = {};

		for (const row of sheetData.allRows) {
			const value = row[header] || "(empty)";
			counts[value] = (counts[value] || 0) + 1;
		}

		return Object.entries(counts)
			.map(([name, value]) => ({ name, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 10); // Top 10
	}, [sheetData, selectedColumnIndex, aiData]);

	const handleAnalyze = async () => {
		if (!sheetData?.allRows) return;
		setIsAnalyzing(true);
		setAiData(null);
		const tipTimeout = setTimeout(() => {
			toast.message(
				"Thinking models may take longer to resolve requests. If problem persists, refresh and try again or try another model.",
				{ duration: 7000 },
			);
		}, 7000);

		try {
			const header = sheetData.headers[selectedColumnIndex];
			const texts = sheetData.allRows
				.map((r) => r[header])
				.filter((v) => v && v.trim().length > 0 && v !== "(empty)");

			const formData = new FormData();
			formData.append("texts", JSON.stringify(texts));

			const response = await fetch("/api/analytics/analyze", {
				method: "POST",
				body: formData,
			});

			const result = await response.json();
			if (result.data) {
				setAiData(result.data);
				setChartType("bar"); // Bar chart is better for word counts
				toast.success("Analysis complete");
			} else if (result.error) {
				console.error(result.error);
				toast.error(result.error);
			}
		} catch (error) {
			console.error("Analysis failed", error);
			toast.error("Analysis failed. Please try again.");
		} finally {
			clearTimeout(tipTimeout);
			setIsAnalyzing(false);
		}
	};

	if (!sheetData) return null;

	const selectedHeader = sheetData.headers[selectedColumnIndex];
	const isTextColumn =
		sheetData.allRows?.some((row) => {
			const value = row[selectedHeader];
			return typeof value === "string" && value.trim().length > 20;
		}) ?? false;

	return (
		<div className="bg-card rounded-xl border border-border p-4">
			<div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
				<div className="flex flex-col">
					<h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
						Chart
						{aiData && (
							<span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
								<span className="material-symbols-outlined text-[14px]">
									auto_awesome
								</span>
								AI Analysis
							</span>
						)}
					</h3>
					<p className="text-sm text-gray-500">
						Analysis for:{" "}
						<span className="font-medium text-indigo-600">
							Q{selectedColumnIndex + 1}
						</span>{" "}
						- {selectedHeader}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{isDesktop ? (
						<div className="inline-flex items-center gap-2 rounded-md border border-input bg-background p-1">
							{isTextColumn && (
								<Button
									variant={aiData ? "outline" : "default"}
									size="sm"
									onClick={handleAnalyze}
									disabled={isAnalyzing}
									className="h-8 text-xs"
								>
									{isAnalyzing ? (
										<>
											<span className="material-symbols-outlined animate-spin text-[14px] mr-2">
												refresh
											</span>
											Analyzing...
										</>
									) : (
										<>
											<span className="material-symbols-outlined text-[14px] mr-2">
												{aiData ? "refresh" : "auto_awesome"}
											</span>
											{aiData ? "Re-analyze" : "Analyze with AI"}
										</>
									)}
								</Button>
							)}
							<Select
								value={chartType}
								onValueChange={(v) => setChartType(v as "pie" | "bar")}
							>
								<SelectTrigger className="h-8 w-24">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="pie">Pie</SelectItem>
									<SelectItem value="bar">Bar</SelectItem>
								</SelectContent>
							</Select>
						</div>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="h-8 w-8 p-0">
									<span className="material-symbols-outlined text-[18px]">
										more_vert
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-44">
								{isTextColumn && (
									<DropdownMenuItem
										onSelect={(event) => {
											event.preventDefault();
											handleAnalyze();
										}}
										disabled={isAnalyzing}
									>
										<span className="material-symbols-outlined text-[16px] mr-2">
											{aiData ? "refresh" : "auto_awesome"}
										</span>
										{isAnalyzing
											? "Analyzing..."
											: aiData
												? "Re-analyze"
												: "Analyze with AI"}
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onSelect={() => setChartType("pie")}
									className={cn(chartType === "pie" && "font-semibold")}
								>
									Pie
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => setChartType("bar")}
									className={cn(chartType === "bar" && "font-semibold")}
								>
									Bar
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>

			{chartData.length > 0 ? (
				<div className="h-72 w-full min-w-0">
					<ResponsiveContainer width="100%" height="100%">
						{chartType === "pie" ? (
							<PieChart>
								<Pie
									data={chartData}
									dataKey="value"
									nameKey="name"
									cx="50%"
									cy="50%"
									innerRadius={60}
									outerRadius={80}
									paddingAngle={2}
								>
									{chartData.map((_, index) => (
										<Cell
											key={`cell-${index}`}
											fill={CHART_COLORS[index % CHART_COLORS.length]}
											strokeWidth={0}
										/>
									))}
								</Pie>
								<RechartsTooltip
									contentStyle={{
										borderRadius: "8px",
										border: "none",
										boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
									}}
								/>
								{isDesktop && (
									<Legend
										layout="vertical"
										verticalAlign="middle"
										align="right"
										wrapperStyle={{
											fontSize: "12px",
											maxWidth: "40%",
											maxHeight: "240px",
											overflowY: "auto",
											paddingRight: "10px",
										}}
									/>
								)}
							</PieChart>
						) : (
							<BarChart data={chartData} layout="vertical">
								<CartesianGrid strokeDasharray="3 3" horizontal={false} />
								<XAxis type="number" hide />
								<YAxis
									dataKey="name"
									type="category"
									width={100}
									tick={{ fontSize: 11 }}
									interval={0}
								/>
								<RechartsTooltip
									cursor={{ fill: "rgba(0,0,0,0.05)" }}
									contentStyle={{
										borderRadius: "8px",
										border: "none",
										boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
									}}
								/>
								<Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
									{chartData.map((_, index) => (
										<Cell
											key={`cell-${index}`}
											fill={CHART_COLORS[index % CHART_COLORS.length]}
										/>
									))}
								</Bar>
							</BarChart>
						)}
					</ResponsiveContainer>
				</div>
			) : (
				<div className="h-32 flex items-center justify-center text-gray-400">
					No data to visualize
				</div>
			)}
		</div>
	);
}
