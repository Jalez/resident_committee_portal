import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { useFormatDate } from "~/hooks/use-format-date";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import type { Receipt } from "~/db";

interface ReceiptContentsDisplayProps {
	receiptId: string;
	receiptUrl: string;
	receipt: Pick<
		Receipt,
		| "rawText"
		| "storeName"
		| "items"
		| "totalAmount"
		| "currency"
		| "purchaseDate"
		| "aiModel"
		| "ocrProcessed"
	> | null;
}

interface OCRResult {
	success?: boolean;
	rawText?: string;
	error?: string;
}

export function ReceiptContentsDisplay({
	receiptId,
	receiptUrl,
	receipt,
}: ReceiptContentsDisplayProps) {
	const { t, i18n } = useTranslation();
	const { formatDate } = useFormatDate();
	const fetcher = useFetcher();
	const isAnalyzing = fetcher.state === "submitting";
	const fetcherData = fetcher.data as OCRResult | undefined;
	const [rawText, setRawText] = useState(receipt?.rawText || "");
	const lastErrorRef = useRef<string | null>(null);

	useEffect(() => {
		if (receipt?.rawText && !rawText) {
			setRawText(receipt.rawText);
		}
	}, [receipt?.rawText, rawText]);

	useEffect(() => {
		if (fetcherData?.rawText) {
			setRawText(fetcherData.rawText);
		}
	}, [fetcherData?.rawText]);

	useEffect(() => {
		if (fetcherData?.success === false) {
			const message =
				fetcherData.error ||
				t("treasury.receipts.ai_parse_failed", {
					defaultValue:
						"AI parsing failed. Try another model or edit the OCR text.",
				});

			if (lastErrorRef.current !== message) {
				toast.error(message);
				lastErrorRef.current = message;
			}
		}
	}, [fetcherData?.error, fetcherData?.success, t]);

	const handleAnalyze = () => {
		const formData = new FormData();
		formData.append("receiptId", receiptId);
		formData.append("receiptUrl", receiptUrl);
		if (rawText.trim()) {
			formData.append("rawText", rawText);
		}

		fetcher.submit(formData, {
			method: "post",
			action: "/api/receipts/ocr",
		});
	};

	if (!receipt?.ocrProcessed) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>
						{t("treasury.receipts.ai_analysis", {
							defaultValue: "AI Analysis",
						})}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-4 text-muted-foreground">
						{t("treasury.receipts.no_analysis_yet", {
							defaultValue: "No AI analysis performed yet for this receipt.",
						})}
					</p>
					{rawText.trim() && (
						<div className="mb-4 space-y-2">
							<Label htmlFor="receipt-raw-text">
								{t("treasury.receipts.raw_text", {
									defaultValue: "OCR Text",
								})}
							</Label>
							<Textarea
								id="receipt-raw-text"
								value={rawText}
								onChange={(event) => setRawText(event.target.value)}
								rows={8}
							/>
						</div>
					)}
					<Button type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
						{isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{t("treasury.receipts.process_text", {
							defaultValue: "Process Raw Text",
						})}
					</Button>
				</CardContent>
			</Card>
		);
	}

	// Parse items if JSON string
	let items: any[] = [];
	try {
		if (receipt.items) {
			items = JSON.parse(receipt.items);
		}
	} catch (e) {
		console.error("Failed to parse items JSON", e);
	}

	const formatReceiptDate = (dateString: Date | string | null) => {
		if (!dateString) return "-";
		return formatDate(dateString);
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>
						{t("treasury.receipts.ai_results", { defaultValue: "AI Results" })}
					</CardTitle>
					{receipt.aiModel && (
						<Badge variant="outline">{receipt.aiModel}</Badge>
					)}
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<span className="text-sm font-medium text-muted-foreground">
								{t("treasury.receipts.store", { defaultValue: "Store" })}
							</span>
							<p className="text-lg font-medium text-foreground">
								{receipt.storeName || "-"}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<span className="text-sm font-medium text-muted-foreground">
								{t("treasury.receipts.date", { defaultValue: "Date" })}
							</span>
							<p className="text-lg font-medium text-foreground">
								{formatReceiptDate(receipt.purchaseDate)}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<span className="text-sm font-medium text-muted-foreground">
								{t("treasury.receipts.total", { defaultValue: "Total" })}
							</span>
							<p className="text-lg font-medium text-foreground">
								{receipt.totalAmount} {receipt.currency}
							</p>
						</div>
					</div>

					{/* Items Table */}
					{items.length > 0 && (
						<div className="mt-4 overflow-hidden rounded-lg border border-border">
							<div className="border-b border-border bg-muted/40 px-4 py-2">
								<h4 className="text-sm font-medium text-foreground">
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
									{items.map((item: any, idx: number) => (
										<TableRow key={item.name || idx}>
											<TableCell>{item.name}</TableCell>
											<TableCell className="text-right">
												{item.quantity}
											</TableCell>
											<TableCell className="text-right">
												{item.totalPrice?.toFixed(2)}{" "}
												{receipt.currency || "EUR"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}

					<div className="pt-4 border-t">
						<div className="space-y-2">
							<Label htmlFor="receipt-raw-text">
								{t("treasury.receipts.raw_text", {
									defaultValue: "OCR Text",
								})}
							</Label>
							<Textarea
								id="receipt-raw-text"
								value={rawText}
								onChange={(event) => setRawText(event.target.value)}
								rows={8}
							/>
						</div>
					</div>

					<div className="pt-2 flex justify-end">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleAnalyze}
							disabled={isAnalyzing}
						>
							{isAnalyzing ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<span className="material-symbols-outlined mr-2 text-base">
									data_object
								</span>
							)}
							{t("treasury.receipts.process_text", {
								defaultValue: "Process Raw Text",
							})}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
