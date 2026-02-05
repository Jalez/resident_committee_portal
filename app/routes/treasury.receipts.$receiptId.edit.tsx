import { Form, redirect, useNavigate, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
	PageWrapper,
	SplitLayout,
} from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
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
import { getDatabase, type Purchase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.receipts.$receiptId.edit";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Muokkaa kuittia / Edit Receipt`,
		},
		{ name: "robots", content: "noindex" },
	];
}

const updateReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	purchaseId: z.string().uuid().optional().or(z.literal("")).or(z.literal("none")),
});

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();
	const receipt = await db.getReceiptById(params.receiptId);

	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-edit support
	const authUser = await requirePermissionOrSelf(
		request,
		"treasury:receipts:update",
		"treasury:receipts:update-self",
		receipt.createdBy,
		getDatabase,
	);

	// Get purchases for linking (only pending/approved ones that haven't been sent yet)
	const allPurchases = await db.getPurchases();
	const linkablePurchases = allPurchases.filter(
		(p) => (p.status === "pending" || p.status === "approved") && !p.emailSent,
	);

	return {
		siteConfig: SITE_CONFIG,
		receipt,
		linkablePurchases,
		languages: {
			primary: authUser?.primaryLanguage || "fi",
			secondary: authUser?.secondaryLanguage || "en",
		},
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();
	const receipt = await db.getReceiptById(params.receiptId);

	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-edit support
	await requirePermissionOrSelf(
		request,
		"treasury:receipts:update",
		"treasury:receipts:update-self",
		receipt.createdBy,
		getDatabase,
	);

	const formData = await request.formData();
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const purchaseId = formData.get("purchaseId") as string;

	// Validate fields
	const result = updateReceiptSchema.safeParse({
		name,
		description,
		purchaseId: purchaseId === "none" ? "" : purchaseId || "",
	});

	if (!result.success) {
		return {
			error: "Validation failed",
			fieldErrors: result.error.flatten().fieldErrors,
		};
	}

	// Extract year from pathname for redirect
	const pathnameParts = receipt.pathname.split("/");
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	// Update receipt record
	await db.updateReceipt(params.receiptId, {
		name: name?.trim() || null,
		description: description?.trim() || null,
		purchaseId:
			purchaseId && purchaseId !== "" && purchaseId !== "none"
				? purchaseId
				: null,
	});

	return redirect(`/treasury/receipts?year=${year}&success=receipt_updated`);
}

export default function TreasuryReceiptsEdit({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { receipt, linkablePurchases, languages } = loaderData;
	const { t } = useTranslation();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	// Extract year from pathname
	const pathnameParts = receipt.pathname.split("/");
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.receipts.edit", { lng: languages.primary }),
					secondary: t("treasury.receipts.edit", {
						lng: languages.secondary,
					}),
				}}
			>
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>{t("treasury.receipts.edit")}</CardTitle>
							<CardDescription>
								{t("treasury.receipts.edit_description")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" className="space-y-4">
								{actionData?.error && (
									<div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
										{actionData.error as string}
									</div>
								)}

								<div className="space-y-2">
									<Label htmlFor="name">
										{t("common.fields.name")}
									</Label>
									<Input
										id="name"
										name="name"
										defaultValue={receipt.name || ""}
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
										defaultValue={receipt.description || ""}
										placeholder={t("treasury.receipts.description_placeholder")}
										rows={3}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="purchaseId">
										{t("treasury.receipts.link_to_reimbursement")}
									</Label>
									<Select
										name="purchaseId"
										defaultValue={receipt.purchaseId || "none"}
									>
										<SelectTrigger id="purchaseId">
											<SelectValue
												placeholder={t("treasury.receipts.select_reimbursement")}
											/>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">
												{t("common.fields.none")}
											</SelectItem>
											{linkablePurchases.map((purchase: Purchase) => (
												<SelectItem key={purchase.id} value={purchase.id}>
													{purchase.description || purchase.id.substring(0, 8)} -{" "}
													{purchase.amount} €
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
											t("common.actions.save")
										)}
									</Button>
									<Button
										type="button"
										variant="outline"
										disabled={isSubmitting}
										onClick={() =>
											navigate(`/treasury/receipts?year=${year}`)
										}
									>
										{t("treasury.receipts.form.cancel")}
									</Button>
								</div>
							</Form>
						</CardContent>
					</Card>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
