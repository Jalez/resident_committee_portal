import { Form, redirect, useNavigate, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
	PageWrapper,
} from "~/components/layout/page-layout";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { FileUpload } from "~/components/ui/file-upload";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { getDatabase, type NewReceipt, type Purchase } from "~/db";
import { requirePermission, getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_ALLOWED_TYPES } from "~/lib/constants";
import { getReceiptStorage } from "~/lib/receipts";
import { buildReceiptPath } from "~/lib/receipts/utils";
import { processReceiptOCR } from "~/lib/receipt-ocr.server";
import type { Route } from "./+types/treasury.receipts.new";
import { PageHeader } from "~/components/layout/page-header";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi kuitti / New Receipt`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "treasury:receipts:write", getDatabase);

	const authUser = await getAuthenticatedUser(request, getDatabase);
	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const selectedYear = yearParam ? Number.parseInt(yearParam, 10) : currentYear;

	// Get purchases for linking (only pending/approved ones that haven't been sent yet)
	const allPurchases = await db.getPurchases();
	const linkablePurchases = allPurchases.filter(
		(p) => (p.status === "pending" || p.status === "approved") && !p.emailSent,
	);

	return {
		siteConfig: SITE_CONFIG,
		selectedYear,
		linkablePurchases,
		languages: {
			primary: authUser?.primaryLanguage || "fi",
			secondary: authUser?.secondaryLanguage || "en",
		},
	};
}

const createReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	purchaseId: z.string().uuid().optional().or(z.literal("")).or(z.literal("none")),
	year: z.coerce.number().int().min(2000).max(2100),
});

export async function action({ request }: Route.ActionArgs) {
	const authUser = await requirePermission(
		request,
		"treasury:receipts:write",
		getDatabase,
	);

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;

	const purchaseId = formData.get("purchaseId") as string;
	const year = Number.parseInt(formData.get("year") as string, 10);
	const ocrEnabled = formData.get("ocr_enabled") === "on";

	if (!file) {
		return { error: "File is required" };
	}

	// Validate file type
	const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
	if (!RECEIPT_ALLOWED_TYPES.includes(ext as (typeof RECEIPT_ALLOWED_TYPES)[number])) {
		return {
			error: "invalid_file_type",
			allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
		};
	}

	// Validate other fields
	const result = createReceiptSchema.safeParse({
		name,
		description,
		purchaseId: purchaseId === "none" ? "" : purchaseId || "",
		year,
	});

	if (!result.success) {
		return { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors };
	}

	// Upload file to storage
	const pathname = buildReceiptPath(String(year), file.name, name || "kuitti");
	let blobUrl: string;
	let finalPathname: string;
	try {
		const storage = getReceiptStorage();
		const result = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true, // Ensure unique path when same filename uploaded same day
		});
		blobUrl = result.url;
		finalPathname = result.pathname;
	} catch (error) {
		console.error("[Receipt New] Upload error:", error);
		return { error: "upload_failed", message: "Failed to upload file" };
	}

	// Create receipt record in database
	const db = getDatabase();
	const receiptName = name?.trim() || file.name;
	const newReceipt: NewReceipt = {
		name: receiptName || null,
		description: description?.trim() || null,
		url: blobUrl,
		pathname: finalPathname,
		purchaseId: purchaseId && purchaseId !== "" && purchaseId !== "none" ? purchaseId : null,
		createdBy: authUser.userId,
	};

	const savedReceipt = await db.createReceipt(newReceipt);

	// Process OCR if enabled
	if (ocrEnabled && savedReceipt) {
		// Fire and forget or await? Awaiting for now to ensure data is ready or at least started reliably
		// But don't block too long on AI if response time is high.
		try {
			// Trigger OCR
			await processReceiptOCR(savedReceipt.url, savedReceipt.id);
		} catch (error) {
			console.error("[Receipt New] OCR failed:", error);
			// We don't fail the request, just log error
		}
	}

	return redirect(`/treasury/receipts?year=${year}&success=receipt_created`);
}

export default function TreasuryReceiptsNew({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { selectedYear, linkablePurchases, languages } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	return (
		<PageWrapper>
			<PageHeader title={t("treasury.receipts.new", "New Receipt")} />
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>{t("treasury.receipts.new")}</CardTitle>
							<CardDescription>
								{t("treasury.receipts.new_description")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" encType="multipart/form-data" className="space-y-4">
								<input type="hidden" name="year" value={selectedYear} />

								{actionData?.error === "invalid_file_type" && (
									<div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
										{t("treasury.receipts.invalid_file_type", {
											types: actionData.allowedTypes as string,
										})}
									</div>
								)}

								{actionData?.error === "upload_failed" && (
									<div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
										{actionData.message as string || t("treasury.receipts.upload_error")}
									</div>
								)}

								<FileUpload
									name="file"
									id="file"
									accept={[...RECEIPT_ALLOWED_TYPES]}
									required
									label={t("treasury.receipts.file")}
									helperText={`${t("treasury.receipts.allowed_types")}: ${RECEIPT_ALLOWED_TYPES.join(", ")}`}
								/>

								<div className="space-y-2">
									<Label htmlFor="name">
										{t("common.fields.name")}
									</Label>
									<Input
										id="name"
										name="name"
										placeholder={t("treasury.receipts.name_placeholder")}
									/>
									<p className="text-sm text-muted-foreground">
										{t("treasury.receipts.name_hint")}
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="description">
										{t("common.fields.description")}
									</Label>
									<Textarea
										id="description"
										name="description"
										placeholder={t("treasury.receipts.description_placeholder")}
										rows={3}
									/>
								</div>

								<div className="flex items-center space-x-2 pb-2">
									<Checkbox id="ocr_enabled" name="ocr_enabled" defaultChecked />
									<label
										htmlFor="ocr_enabled"
										className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									>
										{t("treasury.receipts.analyze_with_ai", { defaultValue: "Analyze with AI (OCR)" })}
									</label>
								</div>

								<div className="space-y-2">
									<Label htmlFor="purchaseId">
										{t("treasury.receipts.link_to_reimbursement")}
									</Label>
									<Select
										name="purchaseId"
										defaultValue="none"
									>
										<SelectTrigger id="purchaseId">
											<SelectValue placeholder={t("treasury.receipts.select_reimbursement")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">{t("common.fields.none")}</SelectItem>
											{linkablePurchases.map((purchase: Purchase) => (
												<SelectItem key={purchase.id} value={purchase.id}>
													{purchase.description || purchase.id.substring(0, 8)} - {purchase.amount} €
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className="text-sm text-muted-foreground">
										{t("treasury.receipts.link_hint")}
									</p>
								</div>

								<div className="flex gap-3 pt-4">
									<Button type="submit" disabled={isSubmitting}>
										{isSubmitting ? (
											<span className="flex items-center gap-2">
												<span className="animate-spin material-symbols-outlined text-sm">
													progress_activity
												</span>
												<span>{t("common.status.saving")}</span>
											</span>
										) : (
											t("treasury.receipts.form.create")
										)}
									</Button>
									<Button
										type="button"
										variant="outline"
										disabled={isSubmitting}
										onClick={() =>
											navigate(
												`/treasury/receipts?year=${selectedYear}`,
											)
										}
									>
										{t("treasury.receipts.form.cancel")}
									</Button>
								</div>
							</Form>
						</CardContent>
					</Card>
				</div>
		</PageWrapper>
	);
}
