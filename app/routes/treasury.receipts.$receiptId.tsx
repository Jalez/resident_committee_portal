import { useTranslation } from "react-i18next";
import { Link, useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import { SectionCard } from "~/components/treasury/section-card";
import { Button } from "~/components/ui/button";
import { getDatabase, type Purchase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/treasury.receipts.$receiptId";

export function meta({ data }: Route.MetaArgs) {
	const receiptName = data?.receipt?.name || data?.receipt?.pathname.split("/").pop() || "Receipt";
	const title = `${receiptName.substring(0, 30)} / View Receipt`;
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const receipt = await db.getReceiptById(params.receiptId);

	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-read support
	await requirePermissionOrSelf(
		request,
		"treasury:receipts:read",
		"treasury:receipts:read-self",
		receipt.createdBy,
		getDatabase,
	);

	// Get linked purchase if exists
	let linkedPurchase: Purchase | null = null;
	if (receipt.purchaseId) {
		linkedPurchase = await db.getPurchaseById(receipt.purchaseId);
	}

	// Get creator name
	const creator = receipt.createdBy ? await db.findUserById(receipt.createdBy) : null;

	return {
		siteConfig: SITE_CONFIG,
		receipt,
		linkedPurchase,
		creatorName: creator?.name || null,
	};
}

export default function ViewReceipt({ loaderData }: Route.ComponentProps) {
	const { receipt, linkedPurchase, creatorName } = loaderData;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t, i18n } = useTranslation();

	// Check if user can edit
	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:receipts:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("treasury:receipts:update-self") &&
		receipt.createdBy &&
		rootData?.user?.userId === receipt.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
			{
				year: "numeric",
				month: "long",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			},
		);

	// Extract year from pathname for navigation
	const pathnameParts = receipt.pathname.split("/");
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader title={t("treasury.receipts.view.title", "View Receipt")} />
					{canUpdate && (
						<Link to={`/treasury/receipts/${receipt.id}/edit`}>
							<Button variant="default">
								<span className="material-symbols-outlined mr-2">edit</span>
								{t("common.actions.edit")}
							</Button>
						</Link>
					)}
				</div>

				<div className="space-y-6">
					{/* Receipt Details */}
					<SectionCard>
						<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
							{t("treasury.receipts.details", "Receipt Details")}
						</h2>
						<div className="space-y-4">
							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("common.fields.name")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white">
									{receipt.name || receipt.pathname.split("/").pop() || "—"}
								</p>
							</div>

							{receipt.description && (
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("common.fields.description")}
									</div>
									<p className="mt-1 text-gray-900 dark:text-white">
										{receipt.description}
									</p>
								</div>
							)}

							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("treasury.receipts.file_path", "File Path")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white font-mono text-sm">
									{receipt.pathname}
								</p>
							</div>

							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("treasury.receipts.receipt_file", "Receipt File")}
								</div>
								<a
									href={receipt.url}
									target="_blank"
									rel="noopener noreferrer"
									className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
								>
									<span className="material-symbols-outlined text-base">
										open_in_new
									</span>
									{t("treasury.receipts.open_receipt", "Open Receipt")}
								</a>
							</div>

							{linkedPurchase && (
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("treasury.receipts.reimbursement_request")}
									</div>
									<Link
										to={`/treasury/reimbursements/${linkedPurchase.id}`}
										className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
									>
										<span className="material-symbols-outlined text-base">
											link
										</span>
										{linkedPurchase.description || linkedPurchase.id.substring(0, 8)}
									</Link>
								</div>
							)}

							{creatorName && (
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("common.fields.created_by")}
									</div>
									<p className="mt-1 text-gray-900 dark:text-white">
										{creatorName}
									</p>
								</div>
							)}

							<div>
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{t("common.fields.created_at", "Created At")}
								</div>
								<p className="mt-1 text-gray-900 dark:text-white">
									{formatDate(receipt.createdAt)}
								</p>
							</div>

							{receipt.updatedAt && receipt.updatedAt !== receipt.createdAt && (
								<div>
									<div className="text-sm font-medium text-gray-700 dark:text-gray-300">
										{t("common.fields.updated_at", "Updated At")}
									</div>
									<p className="mt-1 text-gray-900 dark:text-white">
										{formatDate(receipt.updatedAt)}
									</p>
								</div>
							)}
						</div>
					</SectionCard>

					{/* Actions */}
					<div className="flex gap-3">
						<Link to={`/treasury/receipts?year=${year}`}>
							<Button variant="outline">
								<span className="material-symbols-outlined mr-2">arrow_back</span>
								{t("common.actions.back_to_list", "Back to Receipts")}
							</Button>
						</Link>
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
