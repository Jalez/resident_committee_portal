import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";

interface ParsedReceiptDisplayProps {
	parsedData: {
		storeName?: string;
		items?: Array<{
			name: string;
			quantity: number;
			totalPrice?: number;
		}>;
		totalAmount?: number;
		currency?: string;
		purchaseDate?: string;
	};
	rawText: string;
	aiModel?: string;
}

export function ParsedReceiptDisplay({
	parsedData,
	rawText,
	aiModel = "OpenRouter via analyze API",
}: ParsedReceiptDisplayProps) {
	const { t, i18n } = useTranslation();

	const formatDate = (dateString: string | undefined) => {
		if (!dateString) return "-";
		return new Date(dateString).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
		);
	};

	const hasStructuredData = parsedData && (
		parsedData.storeName ||
		parsedData.items?.length ||
		parsedData.totalAmount ||
		parsedData.purchaseDate
	);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>
					{t("treasury.receipts.ai_results", { defaultValue: "AI Results" })}
				</CardTitle>
				{aiModel && <Badge variant="outline">{aiModel}</Badge>}
			</CardHeader>
			<CardContent className="space-y-4">
				{!hasStructuredData && (
					<div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg">
						<p className="text-sm">
							{t("treasury.receipts.no_ai_parsing", "AI parsing is not configured. Only raw text extraction is available. Configure OpenRouter API key in settings to enable structured data extraction.")}
						</p>
					</div>
				)}

				{hasStructuredData && (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<span className="text-sm font-medium text-gray-500 dark:text-gray-400">
							{t("treasury.receipts.store", { defaultValue: "Store" })}
						</span>
						<p className="font-medium text-lg">{parsedData.storeName || "-"}</p>
					</div>
					<div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<span className="text-sm font-medium text-gray-500 dark:text-gray-400">
							{t("treasury.receipts.date", { defaultValue: "Date" })}
						</span>
						<p className="font-medium text-lg">
							{formatDate(parsedData.purchaseDate)}
						</p>
					</div>
					<div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<span className="text-sm font-medium text-gray-500 dark:text-gray-400">
							{t("treasury.receipts.total", { defaultValue: "Total" })}
						</span>
						<p className="font-medium text-lg">
							{parsedData.totalAmount} {parsedData.currency || "EUR"}
						</p>
					</div>
					</div>
				)}

				{/* Items Table */}
				{hasStructuredData && parsedData.items && parsedData.items.length > 0 && (
					<div className="mt-4 border rounded-lg overflow-hidden">
						<div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b">
							<h4 className="font-medium text-sm">
								{t("treasury.receipts.extracted_items", {
									defaultValue: "Extracted Items",
								})}
							</h4>
						</div>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										{t("common.fields.name", { defaultValue: "Name" })}
									</TableHead>
									<TableHead className="text-right">
										{t("treasury.receipts.quantity", {
											defaultValue: "Qty",
										})}
									</TableHead>
									<TableHead className="text-right">
										{t("treasury.receipts.price", { defaultValue: "Price" })}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{parsedData.items.map((item, idx) => (
									<TableRow key={idx}>
										<TableCell>{item.name}</TableCell>
										<TableCell className="text-right">
											{item.quantity}
										</TableCell>
										<TableCell className="text-right">
											{item.totalPrice?.toFixed(2)}{" "}
											{parsedData.currency || "EUR"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				<div className="pt-4 border-t">
					<div className="space-y-2">
						<label className="text-sm font-medium">
							{t("treasury.receipts.raw_text", {
								defaultValue: "OCR Text",
							})}
						</label>
						<pre className="text-xs whitespace-pre-wrap break-words max-h-40 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
							{rawText}
						</pre>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
