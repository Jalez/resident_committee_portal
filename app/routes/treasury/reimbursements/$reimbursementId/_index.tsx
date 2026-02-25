import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { ViewForm } from "~/components/ui/view-form";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import {
	type CommitteeMailRecipient,
	sendCommitteeEmail,
} from "~/lib/mail-nodemailer.server";
import { maskBankAccount } from "~/lib/mask-bank-account";
import {
	formatMissingRelationshipsMessage,
	validateRequiredRelationships,
} from "~/lib/required-relationships";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

function parseRecipientsJson(
	json: string | null,
): Array<{ email: string; name?: string }> {
	if (!json?.trim()) return [];
	try {
		const parsed = JSON.parse(json) as Array<{ email: string; name?: string }>;
		return Array.isArray(parsed) ? parsed.filter((r) => Boolean(r?.email)) : [];
	} catch {
		return [];
	}
}

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
			let threadMessageIds = new Set<string>();
			if (purchase.emailMessageId) {
				const mailMessage = await db.getCommitteeMailMessageByMessageId(
					purchase.emailMessageId,
				);
				if (mailMessage?.threadId) {
					const threadMessages = await db.getCommitteeMailMessagesByThreadId(
						mailMessage.threadId,
					);
					if (threadMessages.length > 0) {
						threadMessageIds = new Set(threadMessages.map((m) => m.id));
						mailThread = {
							id: mailMessage.threadId,
							subject: threadMessages[0].subject,
							messageCount: threadMessages.length,
						};
					}
				}
			}

			// Subject-based fallback: find orphaned replies that match the
			// reimbursement subject tag but have a different threadId (e.g. the
			// responder composed a new email instead of replying to the thread).
			const subjectTag = `[Reimbursement ${purchase.id}]`;
			const subjectMatches = await db.getCommitteeMailMessagesBySubjectPattern(
				subjectTag,
			);

			// Secondary fallback for legacy emails: if the thread exists, its original subject
			// didn't have the UUID tag. Look for orphaned replies matching the original subject exactly.
			let legacyMatches: typeof subjectMatches = [];
			if (mailThread?.subject) {
				const cleanOriginalSubject = mailThread.subject
					.replace(/^(Re|Fwd|VS|VL|SV|WG|AW|Vast|Vs):\s*/i, "")
					.trim();
				// Only use legacy match if the subject is reasonably long to avoid false positives
				if (cleanOriginalSubject.length > 15) {
					legacyMatches = await db.getCommitteeMailMessagesBySubjectPattern(
						cleanOriginalSubject,
					);
				}
			}

			// Combine all matches and filter out ones already in the thread
			const allSubjectMatches = [...subjectMatches, ...legacyMatches].reduce((acc, current) => {
				const x = acc.find(item => item.id === current.id);
				if (!x) return acc.concat([current]);
				return acc;
			}, [] as typeof subjectMatches);

			const orphanedMessages = allSubjectMatches.filter(
				(m) => !threadMessageIds.has(m.id),
			);
			if (orphanedMessages.length > 0) {
				let targetThreadId: string;
				if (mailThread) {
					// Merge orphaned messages into the thread count
					mailThread.messageCount += orphanedMessages.length;
					targetThreadId = mailThread.id;
				} else {
					// No threaded mail found, but we have subject matches
					targetThreadId = orphanedMessages[0].threadId || orphanedMessages[0].id;
					mailThread = {
						id: targetThreadId,
						subject: orphanedMessages[0].subject,
						messageCount: orphanedMessages.length,
					};
				}

				// Fire and forget updating the orphaned messages to the correct threadId
				Promise.all(
					orphanedMessages.map((m) =>
						db.updateCommitteeMailMessage(m.id, { threadId: targetThreadId }),
					),
				).catch(console.error);
			}

			const allRelationships = await db.getEntityRelationships(
				"reimbursement",
				purchase.id,
			);
			const linkedThreadIds = Array.from(
				new Set(
					allRelationships
						.filter((r) => {
							const isReimbursementA =
								r.relationAType === "reimbursement" &&
								r.relationId === purchase.id;
							const isReimbursementB =
								r.relationBType === "reimbursement" &&
								r.relationBId === purchase.id;
							if (!isReimbursementA && !isReimbursementB) return false;
							const otherType = isReimbursementA
								? r.relationBType
								: r.relationAType;
							return otherType === "mail_thread";
						})
						.map((r) => (r.relationAType === "mail_thread" ? r.relationId : r.relationBId)),
				),
			);
			// Find drafts linked to any of the thread IDs
			const allDrafts = await db.getMailDrafts(50);
			const linkedMailDraft = allDrafts.find(
				(draft) => draft.threadId && linkedThreadIds.includes(draft.threadId),
			) ?? null;

			// If we still don't have a mail thread, but we have linked thread relations,
			// look up the thread directly.
			if (!mailThread && linkedThreadIds.length > 0) {
				for (const tid of linkedThreadIds) {
					const threadMessages = await db.getCommitteeMailMessagesByThreadId(tid);
					if (threadMessages.length > 0) {
						mailThread = {
							id: tid,
							subject: threadMessages[0].subject,
							messageCount: threadMessages.length,
						};
						// Self-heal: backfill the reimbursement's emailMessageId
						const sentMsg = threadMessages.find((m) => m.direction === "sent" && m.messageId);
						if (sentMsg?.messageId) {
							db.updatePurchase(purchase.id, { emailMessageId: sentMsg.messageId }).catch(console.error);
						}
						break;
					}
				}
			}
			const linkedMinuteIds = Array.from(
				new Set(
					allRelationships
						.filter((r) => {
							const isReimbursementA =
								r.relationAType === "reimbursement" &&
								r.relationId === purchase.id;
							const isReimbursementB =
								r.relationBType === "reimbursement" &&
								r.relationBId === purchase.id;
							if (!isReimbursementA && !isReimbursementB) return false;
							const otherType = isReimbursementA
								? r.relationBType
								: r.relationAType;
							return otherType === "minute";
						})
						.map((r) =>
							r.relationAType === "minute" ? r.relationId : r.relationBId,
						),
				),
			);

			let hasMinutesFile = true;
			if (linkedMinuteIds.length > 0) {
				const linkedMinutes = await Promise.all(
					linkedMinuteIds.map((minuteId) => db.getMinuteById(minuteId)),
				);
				hasMinutesFile = linkedMinutes.every(
					(minute) => !!(minute?.fileUrl && minute?.fileKey),
				);
			}

			return {
				mailThread,
				emailConfigured: await isEmailConfigured(),
				hasMinutesFile,
				hasLinkedMailRelation: linkedThreadIds.length > 0,
				linkedMailDraft: linkedMailDraft
					? {
						id: linkedMailDraft.id,
						subject: linkedMailDraft.subject,
					}
					: null,
			};
		},
	});
}

export async function action({ request, params }: Route.ActionArgs) {
	const { getDatabase } = await import("~/db/server.server");
	const { buildReferencesForReply, computeThreadId } = await import(
		"~/lib/mail-threading.server"
	);
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	const purchase = await db.getPurchaseById(params.reimbursementId);
	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	if (actionType === "sendRequest" || actionType === "resendRequest") {
		const allRelationships = await db.getEntityRelationships(
			"reimbursement",
			purchase.id,
		);
		const linkedMailThreadIds = Array.from(
			new Set(
				allRelationships
					.filter((r) => {
						const isReimbursementA =
							r.relationAType === "reimbursement" && r.relationId === purchase.id;
						const isReimbursementB =
							r.relationBType === "reimbursement" && r.relationBId === purchase.id;
						if (!isReimbursementA && !isReimbursementB) return false;
						const otherType = isReimbursementA ? r.relationBType : r.relationAType;
						return otherType === "mail_thread";
					})
					.map((r) => (r.relationAType === "mail_thread" ? r.relationId : r.relationBId)),
			),
		);
		// Find linked mail draft by checking drafts whose threadId matches a linked thread
		const actionDrafts = await db.getMailDrafts(50);
		const linkedMailDraft = actionDrafts.find(
			(draft) => draft.threadId && linkedMailThreadIds.includes(draft.threadId),
		) ?? null;
		if (linkedMailThreadIds.length > 0) {
			if (!linkedMailDraft) {
				return {
					success: false,
					error:
						"A mail relation is linked, but no editable mail draft was found. Link a mail draft and try again.",
				};
			}

			const subject = linkedMailDraft.subject?.trim();
			const body = linkedMailDraft.body?.trim();
			const toRecipients = parseRecipientsJson(linkedMailDraft.toJson);
			const ccRecipients = parseRecipientsJson(linkedMailDraft.ccJson);
			const bccRecipients = parseRecipientsJson(linkedMailDraft.bccJson);

			if (!subject || !body) {
				return {
					success: false,
					error: "The linked mail draft is missing subject or body.",
				};
			}
			if (toRecipients.length === 0) {
				return {
					success: false,
					error: "The linked mail draft has no recipients.",
				};
			}

			const relationshipData = await loadRelationshipsForEntity(
				db,
				"mail_thread",
				linkedMailDraft.threadId || linkedMailDraft.id,
				["reimbursement", "minute", "receipt"],
			);
			const linkedReimbursements = (
				relationshipData.reimbursement?.linked || []
			) as Array<Record<string, unknown>>;
			const linkedMinutes = (relationshipData.minute?.linked || []) as Array<
				Record<string, unknown>
			>;
			const linkedReceipts = (relationshipData.receipt?.linked || []) as Array<
				Record<string, unknown>
			>;

			if (
				linkedReimbursements.length > 0 &&
				(linkedMinutes.length === 0 || linkedReceipts.length === 0)
			) {
				return {
					success: false,
					error:
						"The linked mail draft cannot be sent: reimbursement mail requires both linked minutes and at least one linked receipt.",
				};
			}

			try {
				const minuteAttachments = (
					await Promise.all(
						linkedMinutes.map((minute) =>
							buildMinutesAttachment(
								String(minute.id),
								typeof minute.title === "string" ? minute.title : null,
							),
						),
					)
				).filter((attachment): attachment is NonNullable<typeof attachment> =>
					Boolean(attachment),
				);

				const requestOrigin = new URL(request.url).origin;
				const receiptLinks = linkedReceipts
					.filter((receipt) => typeof receipt.id === "string")
					.map((receipt) => ({
						id: String(receipt.id),
						name:
							(typeof receipt.name === "string" && receipt.name) ||
							(typeof receipt.description === "string" && receipt.description) ||
							`receipt-${String(receipt.id).slice(0, 8)}`,
						url:
							(typeof receipt.url === "string" && receipt.url) ||
							(typeof receipt.fileUrl === "string" && receipt.fileUrl) ||
							(typeof receipt.pathname === "string" && receipt.pathname
								? `${requestOrigin}${receipt.pathname.startsWith("/") ? receipt.pathname : `/${receipt.pathname}`}`
								: "") ||
							"",
					}));
				const receiptAttachments = await buildReceiptAttachments(receiptLinks);

				const reimbursementAttachments = linkedReimbursements.map(
					(reimbursement) => {
						const id = String(reimbursement.id || "");
						const details = [
							`Reimbursement ID: ${id}`,
							`Description: ${String(reimbursement.description || "")}`,
							`Amount: ${String(reimbursement.amount || "")}`,
							`Purchaser: ${String(reimbursement.purchaserName || "")}`,
							`Bank account: ${String(reimbursement.bankAccount || "")}`,
							`Status: ${String(reimbursement.status || "")}`,
							`Year: ${String(reimbursement.year || "")}`,
							`Notes: ${String(reimbursement.notes || "")}`,
						].join("\n");
						return {
							filename: `reimbursement-${id.slice(0, 8)}.txt`,
							content: Buffer.from(details, "utf-8").toString("base64"),
							contentType: "text/plain; charset=utf-8",
						};
					},
				);

				const composeMode =
					(linkedMailDraft.draftType as
						| "new"
						| "reply"
						| "replyAll"
						| "forward") || "new";
				const parentMsgId =
					linkedMailDraft.replyToMessageId || linkedMailDraft.forwardFromMessageId;
				let inReplyToHeader: string | undefined;
				let referencesHeader: string[] | undefined;
				let parentMessage: Awaited<
					ReturnType<typeof db.getCommitteeMailMessageById>
				> = null;
				if (
					parentMsgId &&
					(composeMode === "reply" || composeMode === "replyAll")
				) {
					parentMessage = await db.getCommitteeMailMessageById(parentMsgId);
					if (parentMessage?.messageId) {
						inReplyToHeader = parentMessage.messageId;
						const parentRefs = parentMessage.referencesJson
							? (JSON.parse(parentMessage.referencesJson) as string[])
							: null;
						referencesHeader = buildReferencesForReply(
							parentMessage.messageId,
							parentRefs,
						);
					}
				}

				const bodyHtml = body.replace(/\n/g, "<br>\n");
				let quotedReply:
					| {
						date: string;
						fromName: string;
						fromEmail: string;
						bodyHtml: string;
					}
					| undefined;
				if (
					parentMessage &&
					(composeMode === "reply" || composeMode === "replyAll")
				) {
					quotedReply = {
						date: new Date(parentMessage.date).toLocaleString("en-US", {
							weekday: "short",
							year: "numeric",
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						}),
						fromName: parentMessage.fromName || "",
						fromEmail: parentMessage.fromAddress,
						bodyHtml: parentMessage.bodyHtml,
					};
				}

				const html = quotedReply
					? `${bodyHtml}<br><br>On ${quotedReply.date}, ${quotedReply.fromName || quotedReply.fromEmail} &lt;${quotedReply.fromEmail}&gt; wrote:<br>${quotedReply.bodyHtml}`
					: bodyHtml;

				const result = await sendCommitteeEmail({
					to: toRecipients.map((r) => ({ email: r.email, name: r.name })),
					cc: ccRecipients.length
						? ccRecipients.map((r) => ({ email: r.email, name: r.name }))
						: undefined,
					bcc: bccRecipients.length
						? bccRecipients.map((r) => ({ email: r.email, name: r.name }))
						: undefined,
					subject,
					html,
					inReplyTo: inReplyToHeader,
					references: referencesHeader,
					attachments: [
						...minuteAttachments.map((attachment) => ({
							filename: attachment.name,
							content: attachment.content,
							contentType: attachment.type,
						})),
						...receiptAttachments.map((attachment) => ({
							filename: attachment.name,
							content: attachment.content,
							contentType: attachment.type,
						})),
						...reimbursementAttachments,
					],
				});
				if (!result.success) {
					await db.updatePurchase(purchase.id, {
						emailError: result.error || "Email sending failed",
					});
					return {
						success: false,
						error: result.error || "Email sending failed",
					};
				}

				await db.deleteMailDraft(linkedMailDraft.id);

				const fromEmail = process.env.COMMITTEE_FROM_EMAIL || "";
				const fromName =
					process.env.COMMITTEE_FROM_NAME || process.env.SITE_NAME || "Committee";
				const toJson = JSON.stringify(
					toRecipients.map((r) => ({ email: r.email, name: r.name })),
				);
				const ccJson = ccRecipients.length
					? JSON.stringify(ccRecipients.map((r) => ({ email: r.email, name: r.name })))
					: null;
				const bccJson = bccRecipients.length
					? JSON.stringify(
						bccRecipients.map((r) => ({ email: r.email, name: r.name })),
					)
					: null;

				const sentMessageId = result.messageId || null;
				const parentRefs = parentMessage?.referencesJson
					? (JSON.parse(parentMessage.referencesJson) as string[])
					: null;
				const threadId = computeThreadId(
					sentMessageId,
					inReplyToHeader || null,
					referencesHeader || parentRefs,
				);
				const inserted = await db.insertCommitteeMailMessage({
					direction: "sent",
					fromAddress: fromEmail,
					fromName: fromName || null,
					toJson,
					ccJson,
					bccJson,
					subject,
					bodyHtml: html,
					bodyText: null,
					date: new Date(),
					messageId: sentMessageId,
					inReplyTo: inReplyToHeader || null,
					referencesJson: referencesHeader
						? JSON.stringify(referencesHeader)
						: null,
					threadId,
				});

				await db.updatePurchase(purchase.id, {
					emailSent: true,
					emailMessageId: result.messageId || null,
					emailError: null,
				});

				// Ensure thread record and thread-level relationship exist
				if (threadId) {
					await db.upsertCommitteeMailThread({
						id: threadId,
						subject: linkedMailDraft.subject || "(No subject)",
					});

					const reimbursementThreadRelExists = await db.entityRelationshipExists(
						"reimbursement" as any,
						purchase.id,
						"mail_thread" as any,
						threadId,
					);
					if (!reimbursementThreadRelExists) {
						await db.createEntityRelationship({
							relationAType: "reimbursement",
							relationId: purchase.id,
							relationBType: "mail_thread",
							relationBId: threadId,
							createdBy: null,
						});
					}
				}

				return {
					success: true,
					message: "treasury.reimbursements.email_sent_success",
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				await db.updatePurchase(purchase.id, { emailError: errorMessage });
				return { success: false, error: errorMessage };
			}
		}

		const relationshipsForValidation: Record<string, { linked: any[] }> = {};

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

		const linkedMinuteIds = Array.from(
			new Set(
				allRelationships
					.filter((r) => {
						const isReimbursementA =
							r.relationAType === "reimbursement" && r.relationId === purchase.id;
						const isReimbursementB =
							r.relationBType === "reimbursement" && r.relationBId === purchase.id;
						if (!isReimbursementA && !isReimbursementB) return false;
						const otherType = isReimbursementA ? r.relationBType : r.relationAType;
						return otherType === "minute";
					})
					.map((r) =>
						r.relationAType === "minute" ? r.relationId : r.relationBId,
					),
			),
		);

		const linkedMinutes =
			linkedMinuteIds.length > 0
				? await Promise.all(
					linkedMinuteIds.map((id) => db.getMinuteById(id)),
				).then((minutes) =>
					minutes.filter((m): m is NonNullable<typeof m> => m !== null),
				)
				: [];

		if (
			linkedMinuteIds.length > 0 &&
			(linkedMinutes.length !== linkedMinuteIds.length ||
				linkedMinutes.some((minute) => !minute.fileUrl || !minute.fileKey))
		) {
			return {
				success: false,
				error: "treasury.reimbursements.minutes_file_missing",
			};
		}

		const linkedReceiptIds = allRelationships
			.filter((r) => {
				const isReimbursementA =
					r.relationAType === "reimbursement" && r.relationId === purchase.id;
				const isReimbursementB =
					r.relationBType === "reimbursement" && r.relationBId === purchase.id;
				if (!isReimbursementA && !isReimbursementB) return false;
				const otherType = isReimbursementA ? r.relationBType : r.relationAType;
				return otherType === "receipt";
			})
			.map((r) =>
				r.relationAType === "receipt" ? r.relationId : r.relationBId,
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
		const minutesAttachmentsPromise = Promise.all(
			linkedMinutes.map((minute) =>
				buildMinutesAttachment(minute.id, minute.title || undefined),
			),
		);

		try {
			const [minutesAttachments, receiptAttachments] = await Promise.all([
				minutesAttachmentsPromise,
				receiptAttachmentsPromise,
			]);

			const filteredMinuteAttachments = minutesAttachments.filter(
				(attachment): attachment is NonNullable<typeof attachment> =>
					attachment !== null,
			);

			if (filteredMinuteAttachments.length !== linkedMinutes.length) {
				return {
					success: false,
					error: "treasury.reimbursements.minutes_file_missing",
				};
			}

			const emailResult = await sendReimbursementEmail(
				{
					itemName: purchase.description || "Reimbursement request",
					itemValue: purchase.amount,
					purchaserName: purchase.purchaserName,
					bankAccount: purchase.bankAccount,
					minutesReference:
						linkedMinutes
							.map((minute) => minute.title?.trim() || minute.id)
							.join(", ") || "Ei määritetty / Not specified",
					notes: purchase.notes || undefined,
					receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
				},
				purchase.id,
				filteredMinuteAttachments,
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
				if (mailMessage?.threadId) {
					await db.upsertCommitteeMailThread({
						id: mailMessage.threadId,
						subject: mailMessage.subject,
					});
					const threadRelExists = await db.entityRelationshipExists(
						"reimbursement" as any,
						purchase.id,
						"mail_thread" as any,
						mailMessage.threadId,
					);
					if (!threadRelExists) {
						await db.createEntityRelationship({
							relationAType: "reimbursement",
							relationId: purchase.id,
							relationBType: "mail_thread",
							relationBId: mailMessage.threadId,
							createdBy: null,
						});
					}
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
		hasMinutesFile,
		hasLinkedMailRelation,
		linkedMailDraft,
	} = loaderData as any;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();
	const fetcher = useFetcher();
	const [showResendConfirm, setShowResendConfirm] = useState(false);
	const [showSendConfirm, setShowSendConfirm] = useState(false);

	useEffect(() => {
		if (fetcher.data?.success) {
			if (fetcher.data.message) {
				toast.success(t(fetcher.data.message));
			}
		} else if (fetcher.data?.error) {
			toast.error(
				typeof fetcher.data.error === "string"
					? t(fetcher.data.error, { defaultValue: fetcher.data.error })
					: t("common.feedback.error", { defaultValue: "Error" }),
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

	const requiredValidation = useMemo(() => {
		return validateRequiredRelationships("reimbursement", relationships);
	}, [relationships]);

	const canSendRequest =
		canUpdate &&
		purchase.purchaserName &&
		purchase.bankAccount &&
		requiredValidation.valid &&
		hasMinutesFile &&
		(!hasLinkedMailRelation || Boolean(linkedMailDraft));

	const missingRequirementsMessage = useMemo(() => {
		if (!hasMinutesFile) {
			return t("treasury.reimbursements.minutes_file_missing");
		}
		if (!requiredValidation.valid) {
			return formatMissingRelationshipsMessage(
				requiredValidation.missing,
				t.bind(null),
			);
		}
		if (!purchase.purchaserName || !purchase.bankAccount) {
			return t("treasury.reimbursements.missing_purchaser_info");
		}
		if (hasLinkedMailRelation && !linkedMailDraft) {
			return "A mail relation is linked, but only mail drafts can be sent from reimbursement view.";
		}
		return null;
	}, [
		requiredValidation,
		t,
		hasMinutesFile,
		purchase.purchaserName,
		purchase.bankAccount,
		hasLinkedMailRelation,
		linkedMailDraft,
	]);

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
			mail_thread: {
				linked: [
					{
						id: mailThread.id,
						subject: mailThread.subject || "Email Thread",
					},
				],
			},
		}
		: relationships.mail_thread
			? { mail_thread: relationships.mail_thread }
			: {};

	const handleSendRequest = () => {
		setShowSendConfirm(false);
		fetcher.submit({ _action: "sendRequest" }, { method: "post" });
	};

	const handleResendConfirm = () => {
		setShowResendConfirm(false);
		fetcher.submit({ _action: "resendRequest" }, { method: "post" });
	};

	const headerSendAction =
		!purchase.emailSent && canSendRequest ? (
			<Button
				type="button"
				variant="default"
				size="sm"
				className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
				disabled={fetcher.state === "submitting"}
				onClick={() => setShowSendConfirm(true)}
			>
				<span className="material-symbols-outlined text-base sm:mr-1.5">send</span>
				<span className="hidden sm:inline truncate max-w-full">
					{t("treasury.reimbursements.send_request")}
				</span>
			</Button>
		) : purchase.emailSent && canSendRequest ? (
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3 sm:max-w-[7.5rem] md:max-w-[9rem] lg:max-w-[10.5rem] xl:max-w-none overflow-hidden sm:shrink sm:min-w-0"
				disabled={fetcher.state === "submitting"}
				onClick={() => setShowResendConfirm(true)}
			>
				<span className="material-symbols-outlined text-base sm:mr-1.5">
					refresh
				</span>
				<span className="hidden sm:inline truncate max-w-full">
					{t("treasury.reimbursements.resend_request")}
				</span>
			</Button>
		) : null;

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
				headerActionButtons={headerSendAction}
			>
				{emailConfigured && (
					<div className="space-y-2">
						{!purchase.emailSent &&
							!canSendRequest &&
							missingRequirementsMessage && (
								<div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
									<span className="material-symbols-outlined text-sm">
										warning
									</span>
									<span>
										{t("treasury.reimbursements.missing_requirements", {
											requirements: missingRequirementsMessage,
											defaultValue: `Cannot send: ${missingRequirementsMessage}`,
										})}
									</span>
								</div>
							)}

						{purchase.emailSent && (
							<div className="space-y-3">
								<div className="flex items-center gap-2 text-green-600 dark:text-green-400">
									<span className="material-symbols-outlined text-sm">
										check_circle
									</span>
									{t("treasury.reimbursements.email_sent")}
								</div>
							</div>
						)}

						{mailThread && (
							<Link
								to={`/mail/thread/${encodeURIComponent(mailThread.id)}`}
								className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
							>
								<span className="material-symbols-outlined text-sm">mail</span>
								{t("treasury.reimbursements.view_email_thread")} (
								{mailThread.messageCount}{" "}
								{t("mail.messages_in_thread", {
									count: mailThread.messageCount,
								})}
								)
							</Link>
						)}
					</div>
				)}
			</ViewForm>

			<ConfirmDialog
				open={showSendConfirm}
				onOpenChange={setShowSendConfirm}
				title={t("treasury.reimbursements.send_request")}
				description={
					linkedMailDraft
						? t("treasury.reimbursements.send_linked_mail_confirm_desc", {
							subject: linkedMailDraft.subject,
							defaultValue: linkedMailDraft.subject
								? `This will send the linked mail draft "${linkedMailDraft.subject}" and then track responses in its thread. Sending is blocked if that mail is missing linked minutes or receipts.`
								: "This will send the linked mail draft and then track responses in its thread. Sending is blocked if that mail is missing linked minutes or receipts.",
						})
						: t("treasury.reimbursements.send_confirm_desc", {
							defaultValue:
								"Are you sure you want to send this reimbursement request email now?",
						})
				}
				confirmLabel={t("treasury.reimbursements.send_request")}
				cancelLabel={t("common.actions.cancel")}
				onConfirm={handleSendRequest}
				loading={fetcher.state === "submitting"}
			/>

			<ConfirmDialog
				open={showResendConfirm}
				onOpenChange={setShowResendConfirm}
				title={t("treasury.reimbursements.resend_request")}
				description={t("treasury.reimbursements.resend_confirm_desc")}
				confirmLabel={t("treasury.reimbursements.resend_request")}
				cancelLabel={t("common.actions.cancel")}
				onConfirm={handleResendConfirm}
				loading={fetcher.state === "submitting"}
			/>
		</PageWrapper>
	);
}
