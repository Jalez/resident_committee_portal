import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate, useNavigation } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import {
	type MinuteFile,
	ReimbursementForm,
} from "~/components/treasury/reimbursement-form";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getDatabase, type NewInventoryItem, type NewPurchase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_MAX_SIZE_BYTES } from "~/lib/constants";
import { isEmailConfigured, sendReimbursementEmail } from "~/lib/email.server";
import {
	getMinutesByYear,
	getOrCreateReceiptsFolder,
	getReceiptsByYear,
	uploadReceiptToDrive,
} from "~/lib/google.server";
import type { Route } from "./+types/treasury.reimbursement.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi kulukorvaus / New Reimbursement`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "reimbursements:write", getDatabase);

	const minutesByYear = await getMinutesByYear();
	const recentMinutes: MinuteFile[] = minutesByYear
		.flatMap((year) =>
			year.files.map((file) => ({
				id: file.id,
				name: file.name,
				url: file.url,
				year: year.year,
			})),
		)
		.slice(0, 20);

	// Get receipts for picker
	const receiptsByYear = await getReceiptsByYear();
	const currentYear = new Date().getFullYear();
	const currentYearReceipts = receiptsByYear.find(
		(r) => r.year === currentYear.toString(),
	);

	return {
		siteConfig: SITE_CONFIG,
		recentMinutes,
		emailConfigured: isEmailConfigured(),
		currentYear,
		receiptsByYear,
		receiptsFolderUrl: currentYearReceipts?.folderUrl || "#",
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "reimbursements:write", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();

	const actionType = formData.get("_action");

	// Handle uploadReceipt action for ReceiptPicker
	if (actionType === "uploadReceipt") {
		const receiptFile = formData.get("receiptFile") as File;
		const year = formData.get("year") as string;
		const description = formData.get("description") as string;

		if (!receiptFile || receiptFile.size === 0) {
			return { success: false, error: "No file provided" };
		}

		// Validate file size
		if (receiptFile.size > RECEIPT_MAX_SIZE_BYTES) {
			return { success: false, error: "File too large" };
		}

		try {
			const arrayBuffer = await receiptFile.arrayBuffer();
			const base64Content = Buffer.from(arrayBuffer).toString("base64");

			const result = await uploadReceiptToDrive(
				{
					name: receiptFile.name,
					content: base64Content,
					mimeType: receiptFile.type,
				},
				year,
				description,
			);

			if (result) {
				return { success: true, receipt: result };
			} else {
				return { success: false, error: "Upload failed" };
			}
		} catch (error) {
			console.error("[uploadReceipt] Error:", error);
			return { success: false, error: "Upload failed" };
		}
	}

	// Handle ensureReceiptsFolder action for ReimbursementForm
	if (actionType === "ensureReceiptsFolder") {
		const year = formData.get("year") as string;
		try {
			const result = await getOrCreateReceiptsFolder(year);
			if (result) {
				return { success: true, folderUrl: result.folderUrl };
			}
			return { success: false, error: "Could not create receipts folder" };
		} catch (error) {
			console.error("[ensureReceiptsFolder] Error:", error);
			return { success: false, error: "Failed to create receipts folder" };
		}
	}

	// Handle refreshReceipts action to clear cache
	if (actionType === "refreshReceipts") {
		clearCache("RECEIPTS_BY_YEAR");
		return { success: true };
	}

	const description = formData.get("description") as string;
	const amount = formData.get("amount") as string;
	const purchaserName = formData.get("purchaserName") as string;
	const bankAccount = formData.get("bankAccount") as string;
	const minutesId = formData.get("minutesId") as string;
	const minutesName = formData.get("minutesName") as string;
	let minutesUrl = formData.get("minutesUrl") as string;

	// Ensure we have a valid URL for the minutes
	if (!minutesUrl && minutesId) {
		minutesUrl = `https://drive.google.com/file/d/${minutesId}/view`;
	}
	const notes = formData.get("notes") as string;
	const addToInventory = formData.get("addToInventory") === "on";
	const currentYear = new Date().getFullYear();

	// Parse receipt links from the form (JSON string from ReceiptPicker)
	const receiptLinksJson = formData.get("receiptLinks") as string;
	let receiptLinks: { id: string; name: string; url: string }[] = [];
	try {
		receiptLinks = receiptLinksJson ? JSON.parse(receiptLinksJson) : [];
	} catch {
		receiptLinks = [];
	}

	let inventoryItemId: string | null = null;

	// Create inventory item if requested
	if (addToInventory) {
		const location = formData.get("location") as string;
		const category = formData.get("category") as string;

		const newItem: NewInventoryItem = {
			name: description,
			quantity: 1,
			location: location || "Ei määritetty",
			category: category || null,
			value: amount,
			purchasedAt: new Date(),
		};

		const item = await db.createInventoryItem(newItem);
		inventoryItemId = item.id;
	}

	// Create purchase
	const newPurchase: NewPurchase = {
		inventoryItemId,
		description,
		amount,
		purchaserName,
		bankAccount,
		minutesId,
		minutesName,
		notes: notes || null,
		status: "pending",
		year: currentYear,
		emailSent: false,
	};

	const purchase = await db.createPurchase(newPurchase);

	// Send email with receipt links (fire-and-forget to avoid timeout)
	sendReimbursementEmail(
		{
			itemName: description,
			itemValue: amount,
			purchaserName,
			bankAccount,
			minutesReference: minutesName || minutesId,
			minutesUrl,
			notes,
			receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
		},
		purchase.id,
	)
		.then(async (emailResult) => {
			if (emailResult.success) {
				await db.updatePurchase(purchase.id, {
					emailSent: true,
					emailMessageId: emailResult.messageId,
				});
			} else {
				await db.updatePurchase(purchase.id, {
					emailError: emailResult.error || "Email sending failed",
				});
			}
		})
		.catch(async (error) => {
			console.error("[Reimbursement] Email error:", error);
			await db.updatePurchase(purchase.id, {
				emailError: error instanceof Error ? error.message : "Unknown error",
			});
		});

	return redirect("/treasury/reimbursements?success=true");
}

export default function NewReimbursement({ loaderData }: Route.ComponentProps) {
	const {
		recentMinutes,
		emailConfigured,
		currentYear,
		receiptsByYear,
		receiptsFolderUrl,
	} = loaderData;
	const navigate = useNavigate();
	const [addToInventory, setAddToInventory] = useState(false);
	const [descriptionValue, setDescriptionValue] = useState("");
	const { t } = useTranslation();

	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("treasury.new_reimbursement.title")}
					</h1>
					<p className="text-lg text-gray-500">
						{t("treasury.new_reimbursement.subtitle")}
					</p>
				</div>

				<Form method="post" encType="multipart/form-data" className="space-y-6">
					{/* Purchase Info - description and amount are specific to this form */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
						<h2 className="text-lg font-bold">
							{t("treasury.new_reimbursement.purchase_details")}
						</h2>

						<div className="space-y-2">
							<Label htmlFor="description">
								{t("treasury.new_reimbursement.description")} *
							</Label>
							<Input
								id="description"
								name="description"
								required
								placeholder={t(
									"treasury.new_reimbursement.description_placeholder",
								)}
								value={descriptionValue}
								onChange={(e) => setDescriptionValue(e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="amount">
								{t("treasury.new_reimbursement.amount")} *
							</Label>
							<Input
								id="amount"
								name="amount"
								type="number"
								step="0.01"
								min="0"
								required
								placeholder="0.00"
							/>
						</div>
					</div>

					{/* Reimbursement Form - handles receipts, purchaser info, minutes, notes */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
						<ReimbursementForm
							recentMinutes={recentMinutes}
							emailConfigured={emailConfigured}
							receiptsByYear={receiptsByYear}
							currentYear={currentYear}
							receiptsFolderUrl={receiptsFolderUrl}
							description={descriptionValue}
							showNotes={true}
							showEmailWarning={true}
							required={true}
						/>
					</div>

					{/* Add to Inventory */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
						<div className="flex items-center gap-3">
							<Checkbox
								id="addToInventory"
								name="addToInventory"
								checked={addToInventory}
								onCheckedChange={(checked: boolean) =>
									setAddToInventory(checked)
								}
							/>
							<Label htmlFor="addToInventory" className="cursor-pointer">
								{t("treasury.new_reimbursement.add_to_inventory")}
							</Label>
						</div>

						{addToInventory && (
							<div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
								<div className="space-y-2">
									<Label htmlFor="location">
										{t("treasury.new_reimbursement.location")}
									</Label>
									<Input
										id="location"
										name="location"
										placeholder={t(
											"treasury.new_reimbursement.location_placeholder",
										)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="category">
										{t("treasury.new_reimbursement.category")}
									</Label>
									<Input
										id="category"
										name="category"
										placeholder={t(
											"treasury.new_reimbursement.category_placeholder",
										)}
									/>
								</div>
							</div>
						)}
					</div>

					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(-1)}
							className="flex-1"
						>
							{t("treasury.new_reimbursement.cancel")}
						</Button>
						<Button type="submit" className="flex-1" disabled={isSubmitting}>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<span className="animate-spin material-symbols-outlined text-sm">
										progress_activity
									</span>
									<span>{t("treasury.new_reimbursement.submitting")}</span>
								</span>
							) : (
								t("treasury.new_reimbursement.submit")
							)}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
