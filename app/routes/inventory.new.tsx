import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import {
	type MinuteFile,
	ReimbursementForm,
} from "~/components/treasury/reimbursement-form";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type ComboboxItem,
	SmartCombobox,
} from "~/components/ui/smart-combobox";
import {
	type NewInventoryItem as DbNewInventoryItem,
	getDatabase,
	type NewPurchase,
	type NewTransaction,
} from "~/db";
import i18next from "~/i18next.server";
import { requirePermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_MAX_SIZE_BYTES } from "~/lib/constants";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import {
	getOrCreateReceiptsFolder,
	getReceiptsByYear,
	uploadReceiptToDrive,
} from "~/lib/google.server";
import type { Route } from "./+types/inventory.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.metaTitle || "Uusi tavara / New Item"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();
	const t = await i18next.getFixedT(request, "common");
	const metaTitle = t("inventory.form.title_new");

	// Get recent transactions for duplicate detection
	const currentYear = new Date().getFullYear();
	const transactions = await db.getTransactionsByYear(currentYear);
	const recentTransactions = transactions
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.slice(0, 50)
		.map((t) => ({
			amount: t.amount,
			description: t.description,
			date: t.date,
		}));

	// Get all existing inventory items for auto-fill suggestions
	const existingItems = await db.getInventoryItems();
	const uniqueItems = existingItems.map((item) => ({
		id: item.id,
		name: item.name,
		location: item.location,
		category: item.category,
		description: item.description,
		value: item.value,
	}));

	// Get receipts for picker
	const receiptsByYear = await getReceiptsByYear();
	const currentYearReceipts = receiptsByYear.find(
		(r) => r.year === currentYear.toString(),
	);

	return {
		siteConfig: SITE_CONFIG,
		recentMinutes: [] as MinuteFile[],
		recentTransactions,
		emailConfigured: isEmailConfigured(),
		currentYear,
		existingItems: uniqueItems,
		receiptsByYear,
		receiptsFolderUrl: currentYearReceipts?.folderUrl || "#",
		metaTitle,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action");

	// Handle uploadReceipt action for ReimbursementForm
	if (actionType === "uploadReceipt") {
		const receiptFile = formData.get("receiptFile") as File;
		const year = formData.get("year") as string;
		const description = formData.get("description") as string;

		if (!receiptFile || receiptFile.size === 0) {
			return { success: false, error: "No file provided" };
		}

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

	const addToTreasury = formData.get("addToTreasury") === "on";
	const requestReimbursement = formData.get("requestReimbursement") === "on";

	// Smart add: check if an existing item matches
	const existingItemId = formData.get("existingItemId") as string | null;

	if (existingItemId) {
		// User selected an existing item - just increment quantity
		const existingItem = await db.getInventoryItemById(existingItemId);
		if (existingItem) {
			const addQty = parseInt(formData.get("quantity") as string, 10) || 1;
			await db.updateInventoryItem(existingItemId, {
				quantity: existingItem.quantity + addQty,
			});
			return redirect("/inventory");
		}
	}

	// Create new inventory item
	const newItem: DbNewInventoryItem = {
		name: formData.get("name") as string,
		quantity: parseInt(formData.get("quantity") as string, 10) || 1,
		location: formData.get("location") as string,
		category: (formData.get("category") as string) || null,
		description: (formData.get("description") as string) || null,
		value: (formData.get("value") as string) || "0",
		showInInfoReel: formData.get("showInInfoReel") === "on",
		purchasedAt: formData.get("purchasedAt")
			? new Date(formData.get("purchasedAt") as string)
			: null,
	};

	const inventoryItem = await db.createInventoryItem(newItem);

	// If adding to treasury, create transaction
	if (addToTreasury) {
		const currentYear = new Date().getFullYear();

		// Determine status based on reimbursement request
		const status = requestReimbursement ? "pending" : "complete";
		const reimbursementStatus = requestReimbursement
			? "requested"
			: "not_requested";

		let purchaseId: string | null = null;

		// If requesting reimbursement, create purchase record first
		if (requestReimbursement) {
			const purchaserName = formData.get("purchaserName") as string;
			const bankAccount = formData.get("bankAccount") as string;
			const minutesId = formData.get("minutesId") as string;
			const notes = formData.get("notes") as string;

			// Parse receipt links from the form (JSON string from ReceiptPicker)
			const receiptLinksJson = formData.get("receiptLinks") as string;
			let receiptLinks: { id: string; name: string; url: string }[] = [];
			try {
				receiptLinks = receiptLinksJson ? JSON.parse(receiptLinksJson) : [];
			} catch {
				receiptLinks = [];
			}

			const newPurchase: NewPurchase = {
				inventoryItemId: inventoryItem.id,
				description: newItem.name,
				amount: newItem.value || "0",
				purchaserName,
				bankAccount,
				minutesId: minutesId,
				minutesName: null,
				notes: notes || null,
				status: "pending",
				year: currentYear,
				emailSent: false,
			};

			const purchase = await db.createPurchase(newPurchase);
			purchaseId = purchase.id;

			// Send email with minutes + receipt attachments in background
			const receiptAttachmentsPromise = buildReceiptAttachments(receiptLinks);
			const minutesAttachmentPromise = buildMinutesAttachment(minutesId, null);
			const emailTask = Promise.all([
				minutesAttachmentPromise,
				receiptAttachmentsPromise,
			])
				.then(([minutesAttachment, receiptAttachments]) =>
					sendReimbursementEmail(
						{
							itemName: newItem.name,
							itemValue: newItem.value || "0",
							purchaserName,
							bankAccount,
							minutesReference:
								minutesId || "Ei määritetty / Not specified",
							notes,
							receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
						},
						purchase.id,
						minutesAttachment || undefined,
						receiptAttachments,
					),
				)
				.then(async (emailResult) => {
					if (emailResult.success) {
						await db.updatePurchase(purchase.id, {
							emailSent: true,
							emailMessageId: emailResult.messageId,
						});
					} else {
						await db.updatePurchase(purchase.id, {
							emailError: emailResult.error || "Unknown error",
						});
					}
				})
				.catch(async (error) => {
					await db.updatePurchase(purchase.id, {
						emailError:
							error instanceof Error ? error.message : "Unknown error",
					});
				});
			await emailTask;
		}

		// Create treasury transaction (no longer directly linked - use junction table)
		const newTransaction: NewTransaction = {
			type: "expense",
			amount: newItem.value || "0",
			description: `Hankinta: ${newItem.name}`,
			category: newItem.category || "Tarvikkeet",
			date: newItem.purchasedAt || new Date(),
			year: currentYear,
			status,
			reimbursementStatus,
			purchaseId,
		};

		const transaction = await db.createTransaction(newTransaction);

		// Link inventory item to transaction via junction table
		await db.linkInventoryItemToTransaction(
			inventoryItem.id,
			transaction.id,
			newItem.quantity,
		);
	}

	return redirect("/inventory");
}

export default function NewInventoryItem({ loaderData }: Route.ComponentProps) {
	const {
		recentMinutes,
		recentTransactions,
		emailConfigured,
		currentYear,
		existingItems,
		receiptsByYear,
		receiptsFolderUrl,
	} = loaderData ?? {
		recentMinutes: [] as Array<{ id: string; name: string; year: number }>,
		recentTransactions: [] as Array<{
			amount: string;
			description: string;
			date: Date;
		}>,
		emailConfigured: false,
		currentYear: new Date().getFullYear(),
		existingItems: [] as Array<{
			id: string;
			name: string;
			location: string;
			category: string | null;
			description: string | null;
			value: string | null;
		}>,
		receiptsByYear: [],
		receiptsFolderUrl: "#",
		metaTitle: "New Item",
	};
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [addToTreasury, setAddToTreasury] = useState(false);
	const [requestReimbursement, setRequestReimbursement] = useState(false);
	const [itemValue, setItemValue] = useState("0");
	const [itemName, setItemName] = useState("");
	const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

	// Extract unique options
	const uniqueLocations = Array.from(
		new Set(existingItems.map((i) => i.location)),
	)
		.filter((l): l is string => !!l)
		.sort();
	const uniqueCategories = Array.from(
		new Set(existingItems.map((i) => i.category)),
	)
		.filter((c): c is string => !!c)
		.sort();

	// Auto-fill state
	const [selectedExistingId, setSelectedExistingId] = useState<string | null>(
		null,
	);
	const [location, setLocation] = useState("");
	const [category, setCategory] = useState("");
	const [description, setDescription] = useState("");

	// Auto-fill effect
	// We keep this to handle when user types a name that matches exactly without selecting
	useEffect(() => {
		const match = existingItems.find(
			(i) => i.name.toLowerCase() === itemName.toLowerCase(),
		);
		if (match) {
			setSelectedExistingId(match.id);
			// Only auto-fill if the fields are empty or match the item's values
			if (!location || location === match.location) setLocation(match.location);
			if (!category || category === match.category || !match.category)
				setCategory(match.category || "");
			if (
				!description ||
				description === match.description ||
				!match.description
			)
				setDescription(match.description || "");
			if (
				(!itemValue || itemValue === "0") &&
				match.value &&
				match.value !== "0"
			) {
				setItemValue(match.value);
			}
		} else {
			setSelectedExistingId(null);
		}
	}, [itemName, existingItems, category, description, itemValue, location]);

	// Check if current values match the selected existing item
	const isExactMatch = () => {
		if (!selectedExistingId) return false;
		const match = existingItems.find((i) => i.id === selectedExistingId);
		if (!match) return false;

		return (
			match.location === location &&
			(match.category || "") === category &&
			(match.description || "") === description &&
			(match.value || "0") === itemValue
		);
	};

	// When addToTreasury is unchecked, also uncheck reimbursement
	useEffect(() => {
		if (!addToTreasury) {
			setRequestReimbursement(false);
		}
	}, [addToTreasury]);

	// Check for potential duplicates when value or name changes
	useEffect(() => {
		if (!addToTreasury || !itemValue || parseFloat(itemValue) === 0) {
			setDuplicateWarning(null);
			return;
		}

		const similarTransactions = recentTransactions.filter((t) => {
			const amountMatch =
				Math.abs(parseFloat(t.amount) - parseFloat(itemValue)) < 0.01;
			const nameMatch =
				itemName &&
				t.description.toLowerCase().includes(itemName.toLowerCase());
			return amountMatch || nameMatch;
		});

		if (similarTransactions.length > 0) {
			const examples = similarTransactions
				.slice(0, 2)
				.map((tx) =>
					t("inventory.form.example", {
						example: `"${tx.description}" (${parseFloat(tx.amount).toFixed(2)}€)`,
					}),
				)
				.join(", ");
			setDuplicateWarning(t("inventory.new.duplicate_warning", { examples }));
		} else {
			setDuplicateWarning(null);
		}
	}, [itemValue, itemName, addToTreasury, recentTransactions, t]);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("inventory.form.title_new")}
					</h1>
					<p className="text-lg text-gray-500">
						{t("inventory.form.subtitle_new")}
					</p>
				</div>

				<Form method="post" encType="multipart/form-data" className="space-y-6">
					{/* Basic Item Info */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
						<h2 className="text-lg font-bold text-gray-900 dark:text-white">
							{t("inventory.form.details_header")}
						</h2>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">{t("inventory.form.name_label")} *</Label>
								<SmartCombobox
									items={existingItems.map((i) => ({
										...i,
										value: i.name, // Overwrite value (money) with name for combobox logic
										label: i.name,
										itemValue: i.value, // Keep original money value accessible
									}))}
									value={itemName}
									onValueChange={setItemName}
									placeholder={t("inventory.form.name_placeholder")}
									searchPlaceholder={t(
										"inventory.form.name_search_placeholder",
									)}
									emptyText={t("inventory.form.name_empty")}
									customLabel={t("inventory.add_row.new_text")}
									renderItem={(item) => {
										const comboboxItem = item as ComboboxItem & {
											location?: string;
										};
										return (
											<>
												{comboboxItem.label}
												{comboboxItem.location && (
													<span className="ml-2 text-xs text-muted-foreground">
														({comboboxItem.location})
													</span>
												)}
											</>
										);
									}}
									onSelect={(item) => {
										const comboboxItem = item as ComboboxItem & {
											id: string;
											location: string;
											category?: string;
											description?: string;
											itemValue?: string;
										};
										// Auto-fill logic
										setSelectedExistingId(comboboxItem.id);
										setLocation(comboboxItem.location);
										setCategory(comboboxItem.category || "");
										setDescription(comboboxItem.description || "");
										if (
											comboboxItem.itemValue &&
											comboboxItem.itemValue !== "0"
										)
											setItemValue(comboboxItem.itemValue);
									}}
								/>
								<input type="hidden" name="name" value={itemName} />
								<input
									type="hidden"
									name="existingItemId"
									value={
										isExactMatch() && selectedExistingId
											? selectedExistingId
											: ""
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="quantity">
									{t("inventory.form.quantity_label")} *
								</Label>
								<Input
									id="quantity"
									name="quantity"
									type="number"
									min="1"
									required
									defaultValue={1}
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="location">
									{t("inventory.form.location_label")} *
								</Label>
								<SmartCombobox
									items={uniqueLocations}
									value={location}
									onValueChange={setLocation}
									placeholder={t("inventory.form.location_placeholder")}
									searchPlaceholder={t(
										"inventory.form.location_search_placeholder",
									)}
									emptyText={t("inventory.form.location_empty")}
								/>
								<input type="hidden" name="location" value={location} />
							</div>
							<div className="space-y-2">
								<Label htmlFor="category">
									{t("inventory.form.category_label")}
								</Label>
								<SmartCombobox
									items={uniqueCategories}
									value={category}
									onValueChange={setCategory}
									placeholder={t("inventory.form.category_placeholder")}
									searchPlaceholder={t(
										"inventory.form.category_search_placeholder",
									)}
									emptyText={t("inventory.form.location_empty")}
								/>
								<input type="hidden" name="category" value={category} />
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">
								{t("inventory.form.description_label")}
							</Label>
							<Input
								id="description"
								name="description"
								placeholder={t("inventory.form.description_placeholder")}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="value">{t("inventory.form.value_label")}</Label>
								<Input
									id="value"
									name="value"
									type="number"
									step="0.01"
									min="0"
									value={itemValue}
									onChange={(e) => setItemValue(e.target.value)}
									placeholder={t("inventory.form.value_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="purchasedAt">
									{t("inventory.form.purchased_at_label")}
								</Label>
								<Input
									id="purchasedAt"
									name="purchasedAt"
									type="date"
									defaultValue={new Date().toISOString().split("T")[0]}
								/>
							</div>
						</div>

						<div className="flex items-center gap-3 pt-2">
							<Checkbox id="showInInfoReel" name="showInInfoReel" />
							<Label htmlFor="showInInfoReel" className="cursor-pointer">
								{t("inventory.form.show_in_info_reel")}
							</Label>
						</div>
					</div>

					{/* Treasury Transaction Section */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
						<div className="flex items-center gap-3">
							<Checkbox
								id="addToTreasury"
								name="addToTreasury"
								checked={addToTreasury}
								onCheckedChange={(checked) =>
									setAddToTreasury(checked === true)
								}
							/>
							<Label
								htmlFor="addToTreasury"
								className="text-lg font-bold cursor-pointer"
							>
								{t("inventory.new.add_treasury_label")}
							</Label>
						</div>

						<p className="text-sm text-gray-500 dark:text-gray-400">
							{t("inventory.new.add_treasury_desc")}
						</p>

						{/* Duplicate Warning */}
						{duplicateWarning && (
							<div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
								<p className="text-sm text-orange-800 dark:text-orange-200">
									⚠️ {duplicateWarning}
								</p>
							</div>
						)}

						{/* Reimbursement Section - only if treasury is checked */}
						{addToTreasury && (
							<div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
								<div className="flex items-center gap-3">
									<Checkbox
										id="requestReimbursement"
										name="requestReimbursement"
										checked={requestReimbursement}
										onCheckedChange={(checked) =>
											setRequestReimbursement(checked === true)
										}
									/>
									<Label
										htmlFor="requestReimbursement"
										className="font-bold cursor-pointer"
									>
										{t("inventory.new.request_reimbursement_label")}
									</Label>
								</div>

								<p className="text-sm text-gray-500 dark:text-gray-400">
									{t("inventory.new.request_reimbursement_desc")}
								</p>

								{/* Reimbursement Details - only if reimbursement is checked */}
								{requestReimbursement && (
									<div className="pt-4 border-t border-gray-200 dark:border-gray-700">
										<ReimbursementForm
											recentMinutes={recentMinutes.map((m) => ({
												...m,
												year: m.year.toString(),
											}))}
											emailConfigured={emailConfigured}
											receiptsByYear={receiptsByYear}
											currentYear={currentYear}
											receiptsFolderUrl={receiptsFolderUrl}
											description={itemName}
											showNotes={true}
											required={requestReimbursement}
										/>
									</div>
								)}
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
							{t("inventory.form.cancel")}
						</Button>
						<Button type="submit" className="flex-1">
							{requestReimbursement
								? t("inventory.form.add_and_request")
								: addToTreasury
									? t("inventory.form.add_to_treasury_btn")
									: t("inventory.form.add")}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
