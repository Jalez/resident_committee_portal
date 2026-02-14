import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useRouteLoaderData } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { ViewForm } from "~/components/ui/view-form";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import { maskBankAccount } from "~/lib/mask-bank-account";
import {
	formatMissingRelationshipsMessage,
	validateRequiredRelationships,
} from "~/lib/required-relationships";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const description = (data as any)?.reimbursement?.description;
	const title = description
		? `${description.substring(0, 30)} / View Reimbursement`
		: "View Reimbursement";
	return [
		{ title: `${(data as any)?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createViewLoader({
		entityType: "reimbursement",
		permission: "treasury:reimbursements:read",
		permissionSelf: "treasury:reimbursements:read-self",
		params,
		request,
		fetchEntity: (db, id) => db.getPurchaseById(id),
		extend: async ({ db, entity: purchase }) => {
			let mailThread = null;
			if (purchase.emailMessageId) {
				const mailMessage = await db.getCommitteeMailMessageByMessageId(
					purchase.emailMessageId,
				);
				if (mailMessage?.threadId) {
					const threadMessages = await db.getCommitteeMailMessagesByThreadId(
						mailMessage.threadId,
					);
					if (threadMessages.length > 0) {
						mailThread = {
							id: mailMessage.threadId,
							subject: threadMessages[0].subject,
							messageCount: threadMessages.length,
						};
					}
				}
			}
			return {
				mailThread,
				emailConfigured: await isEmailConfigured(),
			};
		},
	});
}

export async function action({ request, params }: Route.ActionArgs) {
	const { getDatabase } = await import("~/db/server.server");
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	const purchase = await db.getPurchaseById(params.reimbursementId);
	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	if (actionType === "sendRequest") {
		// Validate required relationships before sending
		const allRelationships = await db.getEntityRelationships(
			"reimbursement",
			purchase.id,
		);

		// Build relationships object for validation
		const relationshipsForValidation: Record<string, { linked: any[] }> = {};

		// Extract linked entities by type
		for (const rel of allRelationships) {
			let linkedType: string | null = null;
			let linkedId: string | null = null;

			if (
				rel.relationAType === "reimbursement" &&
				rel.relationId === purchase.id
			) {
				linkedType = rel.relationBType;
				linkedId = rel.relationBId;
			} else if (
				rel.relationBType === "reimbursement" &&
				rel.relationBId === purchase.id
			) {
				linkedType = rel.relationAType;
				linkedId = rel.relationId;
			}

			if (linkedType && linkedId) {
				if (!relationshipsForValidation[linkedType]) {
					relationshipsForValidation[linkedType] = { linked: [] };
				}
				relationshipsForValidation[linkedType].linked.push({ id: linkedId });
			}
		}

		const validation = validateRequiredRelationships(
			"reimbursement",
			relationshipsForValidation,
		);

		if (!validation.valid) {
			return {
				success: false,
				error: formatMissingRelationshipsMessage(
					validation.missing,
					(key, opts) =>
						key.includes(".")
							? key
							: `Missing required relationships: ${validation.missing.map((m) => m.type).join(", ")}`,
				),
			};
		}

		// Get receipt attachments
		const linkedReceiptIds = allRelationships
			.filter(
				(r) => r.relationBType === "receipt" || r.relationAType === "receipt",
			)
			.map((r) =>
				r.relationBType === "receipt" ? r.relationBId : r.relationId,
			);
		const linkedReceipts =
			linkedReceiptIds.length > 0
				? await Promise.all(
						linkedReceiptIds.map((id) => db.getReceiptById(id)),
					).then((receipts) =>
						receipts.filter((r): r is NonNullable<typeof r> => r !== null),
					)
				: [];

		if (linkedReceipts.length === 0) {
			return {
				success: false,
				error: "treasury.new_reimbursement.missing_receipts",
			};
		}

		const receiptLinks = linkedReceipts
			.filter((r) => r.pathname && r.url)
			.map((r) => ({
				id: r.pathname!,
				name: r.name || r.pathname?.split("/").pop() || "Receipt",
				url: r.url!,
			}));

		const receiptAttachmentsPromise = buildReceiptAttachments(receiptLinks);
		const minutesAttachmentPromise = buildMinutesAttachment(
			purchase.minutesId,
			purchase.minutesName || undefined,
		);

		try {
			const [minutesAttachment, receiptAttachments] = await Promise.all([
				minutesAttachmentPromise,
				receiptAttachmentsPromise,
			]);

			const emailResult = await sendReimbursementEmail(
				{
					itemName: purchase.description || "Reimbursement request",
					itemValue: purchase.amount,
					purchaserName: purchase.purchaserName,
					bankAccount: purchase.bankAccount,
					minutesReference:
						purchase.minutesName ||
						purchase.minutesId ||
						"Ei määritetty / Not specified",
					notes: purchase.notes || undefined,
					receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
				},
				purchase.id,
				minutesAttachment || undefined,
				receiptAttachments,
				db,
			);

			if (emailResult.success && emailResult.messageId) {
				await db.updatePurchase(purchase.id, {
					emailSent: true,
					emailMessageId: emailResult.messageId,
					emailError: null,
				});

				const mailMessage = await db.getCommitteeMailMessageByMessageId(
					emailResult.messageId,
				);
				if (mailMessage) {
					await db.createEntityRelationship({
						relationAType: "reimbursement",
						relationId: purchase.id,
						relationBType: "mail",
						relationBId: mailMessage.id,
						createdBy: null,
					});
				}

				return {
					success: true,
					message: "treasury.reimbursements.email_sent_success",
				};
			} else {
				await db.updatePurchase(purchase.id, {
					emailError: emailResult.error || "Email sending failed",
				});
				return {
					success: false,
					error: emailResult.error || "Email sending failed",
				};
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			await db.updatePurchase(purchase.id, {
				emailError: errorMessage,
			});
			return { success: false, error: errorMessage };
		}
	}

	return { success: false, error: "Invalid action" };
}

export default function ViewReimbursement({
	loaderData,
}: Route.ComponentProps) {
	const {
		reimbursement: purchase,
		relationships,
		mailThread,
		emailConfigured,
	} = loaderData as any;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();
	const fetcher = useFetcher();

	useEffect(() => {
		if (fetcher.data?.success) {
			if (fetcher.data.message) {
				toast.success(t(fetcher.data.message));
			}
		} else if (fetcher.data?.error) {
			toast.error(
				typeof fetcher.data.error === "string" ? fetcher.data.error : "Error",
			);
		}
	}, [fetcher.data, t]);

	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:reimbursements:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes(
			"treasury:reimbursements:update-self",
		) &&
		purchase.createdBy &&
		rootData?.user?.userId === purchase.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	const isCreator =
		purchase.createdBy && rootData?.user?.userId === purchase.createdBy;
	const canViewFullBankAccount = canUpdateGeneral || isCreator;

	const linkedReceipts = relationships.receipt?.linked || [];

	// Validate required relationships for sending email
	const requiredValidation = useMemo(() => {
		return validateRequiredRelationships("reimbursement", relationships);
	}, [relationships]);

	const canSendRequest =
		canUpdate &&
		purchase.purchaserName &&
		purchase.bankAccount &&
		requiredValidation.valid;

	const missingRequirementsMessage = useMemo(() => {
		if (requiredValidation.valid) return null;
		return formatMissingRelationshipsMessage(
			requiredValidation.missing,
			t.bind(null),
		);
	}, [requiredValidation, t]);

	const displayFields = {
		description: purchase.description || "—",
		amount: { value: purchase.amount, valueClassName: "font-bold" },
		purchaserName: purchase.purchaserName || "—",
		bankAccount: {
			value: canViewFullBankAccount
				? purchase.bankAccount || "—"
				: maskBankAccount(purchase.bankAccount),
			valueClassName: "font-mono",
		},
		notes: { value: purchase.notes, hide: !purchase.notes },
		status: purchase.status,
	};

	const mailRelationships = mailThread
		? {
				mail: {
					linked: [
						{
							id: mailThread.id,
							name: mailThread.subject || "Email Thread",
							__type: "mail",
						},
					],
				},
			}
		: relationships.mail
			? { mail: relationships.mail }
			: {};

	return (
		<PageWrapper>
			<ViewForm
				title={t("treasury.reimbursements.view.title")}
				entityType="reimbursement"
				entityId={purchase.id}
				entityName={purchase.description || ""}
				displayFields={displayFields}
				relationships={{ ...relationships, ...mailRelationships }}
				returnUrl="/treasury/reimbursements"
				canEdit={canUpdate && !purchase.emailSent}
				canDelete={canUpdate && !purchase.emailSent}
				translationNamespace="treasury.reimbursements"
			>
				{!purchase.emailSent && emailConfigured && (
					<div className="space-y-2">
						{canSendRequest ? (
							<fetcher.Form method="post">
								<Button
									type="submit"
									name="_action"
									value="sendRequest"
									variant="default"
									disabled={fetcher.state === "submitting"}
								>
									<span className="material-symbols-outlined mr-2">send</span>
									{t("treasury.reimbursements.send_request")}
								</Button>
							</fetcher.Form>
						) : (
							missingRequirementsMessage && (
								<div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
									<span className="material-symbols-outlined text-sm">
										warning
									</span>
									<span>
										{t("treasury.reimbursements.missing_requirements", {
											defaultValue: `Cannot send: ${missingRequirementsMessage}`,
										})}
									</span>
								</div>
							)
						)}
					</div>
				)}

				{purchase.emailSent && (
					<div className="flex items-center gap-2 text-green-600 dark:text-green-400">
						<span className="material-symbols-outlined text-sm">
							check_circle
						</span>
						{t("treasury.reimbursements.email_sent")}
					</div>
				)}
			</ViewForm>
		</PageWrapper>
	);
}
