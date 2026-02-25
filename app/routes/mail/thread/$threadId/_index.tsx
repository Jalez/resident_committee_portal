import {
	ArrowLeft,
	ChevronDown,
	ChevronUp,
	Forward,
	Reply,
	ReplyAll,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useFetcher } from "react-router";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { hasAnyPermission, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import type { AnyEntity } from "~/lib/entity-converters";
import { IsolatedEmailContent } from "~/components/isolated-email-content";
import type { Route } from "./+types/_index";

export async function action({ request, params }: Route.ActionArgs) {
	const currentUser = await requirePermission(
		request,
		"committee:email",
		getDatabase,
	);
	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	const db = getDatabase();

	if (intent === "save_relationships") {
		const messageId = formData.get("relationAId") as string;
		if (!messageId) return { success: false, error: "Missing messageId" };

		// Save relationship changes using the universal system
		await saveRelationshipChanges(
			db,
			"mail",
			messageId,
			formData,
			currentUser.userId || null,
			currentUser.permissions,
		);

		// Check for source context to create auto-link (if creating new from specific context)
		const sourceType = formData.get("_sourceType") as string | null;
		const sourceId = formData.get("_sourceId") as string | null;
		if (sourceType && sourceId) {
			const exists = await db.entityRelationshipExists(
				sourceType as any,
				sourceId,
				"mail",
				messageId,
			);
			if (!exists) {
				await db.createEntityRelationship({
					relationAType: sourceType as any,
					relationId: sourceId,
					relationBType: "mail",
					relationBId: messageId,
					createdBy: null,
				});
			}
		}

		return { success: true };
	}

	if (intent === "set_reimbursement_verdict") {
		const reimbursementId = formData.get("reimbursementId") as string;
		const verdict = formData.get("verdict") as
			| "approved"
			| "rejected"
			| "pending"
			| null;

		if (!reimbursementId || !verdict) {
			return { success: false, error: "Missing reimbursementId or verdict" };
		}

		if (!["approved", "rejected", "pending"].includes(verdict)) {
			return { success: false, error: "Invalid verdict" };
		}

		const canUpdateReimbursements = hasAnyPermission(currentUser, [
			"treasury:reimbursements:update",
			"treasury:reimbursements:write",
			"*",
		]);

		if (!canUpdateReimbursements) {
			return { success: false, error: "Insufficient permissions" };
		}

		const purchase = await db.getPurchaseById(reimbursementId);
		if (!purchase) {
			return { success: false, error: "Reimbursement not found" };
		}

		await db.updatePurchase(reimbursementId, { status: verdict });

		const relationships = await db.getEntityRelationships(
			"reimbursement",
			reimbursementId,
		);
		const transactionId =
			relationships.find(
				(r) =>
					r.relationBType === "transaction" || r.relationAType === "transaction",
			)?.relationBType === "transaction"
				? relationships.find((r) => r.relationBType === "transaction")
					?.relationBId
				: relationships.find((r) => r.relationAType === "transaction")
					?.relationId;

		if (transactionId) {
			const linkedTransaction = await db.getTransactionById(transactionId);
			if (linkedTransaction) {
				const reimbursementStatus =
					verdict === "approved"
						? "approved"
						: verdict === "rejected"
							? "declined"
							: "requested";
				const transactionStatus =
					verdict === "approved"
						? "complete"
						: verdict === "rejected"
							? "declined"
							: "pending";

				await db.updateTransaction(linkedTransaction.id, {
					reimbursementStatus,
					status: transactionStatus,
				});
			}
		}

		if (verdict === "approved" || verdict === "rejected") {
			const { createReimbursementStatusNotification } = await import(
				"~/lib/notifications.server"
			);
			await createReimbursementStatusNotification(
				{ ...purchase, status: verdict },
				verdict,
				db,
			);
		}

		return { success: true };
	}

	return { success: false, error: "Unknown action" };
}

export function meta({ data }: Route.MetaArgs) {
	const subject = data?.messages?.[0]?.subject;
	return [
		{
			title: subject
				? `${data?.siteConfig?.name || "Portal"} - ${subject}`
				: `${data?.siteConfig?.name || "Portal"} - Thread`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const currentUser = await requirePermission(
		request,
		"committee:email",
		getDatabase,
	);
	const threadId = decodeURIComponent(params.threadId);
	if (!threadId) throw new Response("Not Found", { status: 404 });

	const db = getDatabase();
	const messages = await db.getCommitteeMailMessagesByThreadId(threadId);

	if (messages.length === 0) {
		throw new Response("Not Found", { status: 404 });
	}

	const reimbursementIds = new Set<string>();
	for (const message of messages) {
		const rels = await db.getEntityRelationships("mail", message.id);
		for (const rel of rels) {
			const isMailA = rel.relationAType === "mail" && rel.relationId === message.id;
			const isMailB = rel.relationBType === "mail" && rel.relationBId === message.id;
			if (!isMailA && !isMailB) continue;
			const relatedType = isMailA ? rel.relationBType : rel.relationAType;
			const relatedId = isMailA ? rel.relationBId : rel.relationId;
			if (relatedType === "reimbursement") reimbursementIds.add(relatedId);
		}
	}

	let hasPendingLinkedReimbursement = false;
	const linkedReimbursements: Array<{
		id: string;
		description: string;
		status: "draft" | "pending" | "approved" | "rejected" | "reimbursed";
	}> = [];
	for (const reimbursementId of reimbursementIds) {
		const reimbursement = await db.getPurchaseById(reimbursementId);
		if (!reimbursement) continue;
		linkedReimbursements.push({
			id: reimbursement.id,
			description:
				reimbursement.description?.trim() ||
				`Reimbursement ${reimbursement.id.slice(0, 8)}`,
			status: reimbursement.status,
		});
		if (
			reimbursement.status !== "approved" &&
			reimbursement.status !== "rejected" &&
			reimbursement.status !== "reimbursed"
		) {
			hasPendingLinkedReimbursement = true;
			break;
		}
	}

	const replyVerdicts: Record<string, "approved" | "rejected" | "unclear"> = {};
	if (hasPendingLinkedReimbursement) {
		const { parseReimbursementReply } = await import("~/lib/email.server");
		const inboundMessages = messages.filter((m) => m.direction === "inbox").slice(-8);
		for (const message of inboundMessages) {
			const content =
				message.bodyText?.trim() ||
				message.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
				message.subject;
			if (!content) continue;
			replyVerdicts[message.id] = await parseReimbursementReply(content);
		}
	}

	// Use the latest message as the main anchor for relationships in this thread
	let mainMessage = messages[messages.length - 1];
	const relationshipTypes: RelationshipEntityType[] = [
		"reimbursement",
		"transaction",
		"event",
		"minute",
	];

	// Load relationships
	let relationships = await loadRelationshipsForEntity(
		db,
		"mail",
		mainMessage.id,
		relationshipTypes,
		{ userPermissions: currentUser.permissions },
	);

	const hasLinkedRelationships = (value: typeof relationships) =>
		relationshipTypes.some((type) => (value as any)[type]?.linked?.length > 0);

	if (!hasLinkedRelationships(relationships)) {
		for (let i = messages.length - 2; i >= 0; i--) {
			const candidate = messages[i];
			const candidateRelationships = await loadRelationshipsForEntity(
				db,
				"mail",
				candidate.id,
				relationshipTypes,
				{ userPermissions: currentUser.permissions },
			);
			if (hasLinkedRelationships(candidateRelationships)) {
				mainMessage = candidate;
				relationships = candidateRelationships;
				break;
			}
		}
	}

	// Get context
	const contextValues = await getRelationshipContext(db, "mail", mainMessage.id);

	return {
		siteConfig: SITE_CONFIG,
		messages,
		threadId,
		relationships,
		contextValues,
		mainMessageId: mainMessage.id,
		replyVerdicts,
		hasPendingLinkedReimbursement,
		linkedReimbursements,
		canUpdateReimbursementVerdict: hasAnyPermission(currentUser, [
			"treasury:reimbursements:update",
			"treasury:reimbursements:write",
			"*",
		]),
	};
}

function formatRecipientsJson(json: string | null): string {
	if (!json) return "";
	try {
		const arr = JSON.parse(json) as { email: string; name?: string }[];
		if (!Array.isArray(arr)) return "";
		return arr
			.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
			.join(", ");
	} catch {
		return "";
	}
}

export default function MailThread({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { messages, threadId, mainMessageId, replyVerdicts, hasPendingLinkedReimbursement } =
		loaderData;
	const linkedReimbursements =
		(loaderData.linkedReimbursements as Array<{
			id: string;
			description: string;
			status: "draft" | "pending" | "approved" | "rejected" | "reimbursed";
		}>) || [];
	const canUpdateReimbursementVerdict = Boolean(
		(loaderData as any).canUpdateReimbursementVerdict,
	);
	const { t } = useTranslation();
	const deleteFetcher = useFetcher();

	// Use relationship picker hook
	const relationshipPicker = useRelationshipPicker({
		relationAType: "mail",
		relationAId: mainMessageId,
		initialRelationships: [],
	});
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(() => {
		// Expand the last message by default
		const set = new Set<string>();
		if (messages.length > 0) {
			set.add(messages[messages.length - 1].id);
		}
		return set;
	});
	const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);

	const threadSubject =
		messages[0]?.subject?.replace(/^(Re|Fwd|Fw):\s*/gi, "") ||
		t("mail.no_subject");

	const primaryReimbursementVerdict =
		linkedReimbursements.length === 1
			? linkedReimbursements[0].status === "approved"
				? "approved"
				: linkedReimbursements[0].status === "rejected"
					? "rejected"
					: "pending"
			: null;

	const isManualOverrideForMessage = (messageId: string) => {
		const aiVerdict = replyVerdicts?.[messageId] as
			| "approved"
			| "rejected"
			| "unclear"
			| undefined;
		if (!aiVerdict || !primaryReimbursementVerdict) return false;
		const aiAsVerdict = aiVerdict === "unclear" ? "pending" : aiVerdict;
		return aiAsVerdict !== primaryReimbursementVerdict;
	};

	const toggleExpand = (id: string) => {
		setExpandedMessages((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleDeleteMessage = () => {
		if (!deleteMessageId) return;
		const msg = messages.find((m) => m.id === deleteMessageId);
		const formData = new FormData();
		formData.set("_action", "deleteMessage");
		formData.set("messageId", deleteMessageId);
		formData.set("direction", msg?.direction || "inbox");
		deleteFetcher.submit(formData, { action: "/mail", method: "post" });
		setDeleteMessageId(null);
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Thread header */}
			<div className="border-border flex items-center gap-2 border-b pb-3">
				<Button variant="ghost" size="icon" asChild className="shrink-0">
					<Link to="/mail">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<h1 className="text-foreground text-xl font-semibold">
					{threadSubject}
				</h1>
				<span className="text-muted-foreground ml-2 text-sm">
					{t("mail.messages_in_thread", {
						count: messages.length,
						defaultValue: `${messages.length} messages`,
					})}
				</span>
				{hasPendingLinkedReimbursement && (
					<Badge variant="secondary" className="ml-2">
						{t("mail.reimbursement_auto_interpretation", {
							defaultValue: "Auto reimbursement interpretation active",
						})}
					</Badge>
				)}
			</div>
			{linkedReimbursements.length > 0 && canUpdateReimbursementVerdict && (
				<div className="bg-muted/40 border-border flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
					<span className="text-muted-foreground">
						{t("mail.override_ai_verdict", {
							defaultValue: "Override AI verdict",
						})}
					</span>
					{linkedReimbursements.map((reimbursement) => (
						<Form method="post" key={reimbursement.id} className="flex items-center gap-2">
							<input type="hidden" name="_action" value="set_reimbursement_verdict" />
							<input
								type="hidden"
								name="reimbursementId"
								value={reimbursement.id}
							/>
							<span className="text-foreground max-w-64 truncate" title={reimbursement.description}>
								{reimbursement.description}
							</span>
							<select
								name="verdict"
								defaultValue={
									reimbursement.status === "reimbursed" || reimbursement.status === "draft"
										? "pending"
										: reimbursement.status
								}
								className="border-input bg-background text-foreground rounded-md border px-2 py-1"
							>
								<option value="approved">
									{t("mail.ai_verdict_approved", { defaultValue: "Approved" })}
								</option>
								<option value="rejected">
									{t("mail.ai_verdict_rejected", { defaultValue: "Rejected" })}
								</option>
								<option value="pending">
									{t("mail.ai_verdict_pending", { defaultValue: "Pending" })}
								</option>
							</select>
							<Button size="sm" variant="outline" type="submit">
								{t("common.actions.save", { defaultValue: "Save" })}
							</Button>
						</Form>
					))}
				</div>
			)}

			{/* Message list */}
			<div className="flex flex-col gap-3">
				{messages.map((msg) => {
					const isExpanded = expandedMessages.has(msg.id);
					const fromDisplay = msg.fromName
						? `${msg.fromName} <${msg.fromAddress}>`
						: msg.fromAddress;
					const dateStr = new Date(msg.date).toLocaleString(undefined, {
						dateStyle: "medium",
						timeStyle: "short",
					});

					return (
						<div
							key={msg.id}
							className="border-border bg-card overflow-hidden rounded-lg border"
						>
							{/* Message header (always visible) */}
							<button
								type="button"
								onClick={() => toggleExpand(msg.id)}
								className="bg-muted hover:bg-accent flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
							>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<div className="flex items-center gap-2">
										<span className="text-foreground truncate text-sm font-medium">
											{msg.fromName || msg.fromAddress}
										</span>
										{msg.direction === "sent" && (
											<span className="bg-secondary text-secondary-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
												{t("mail.sent")}
											</span>
										)}
										{msg.direction === "inbox" && replyVerdicts?.[msg.id] && (
											<Badge
												variant={
													replyVerdicts[msg.id] === "approved"
														? "default"
														: replyVerdicts[msg.id] === "rejected"
															? "destructive"
															: "secondary"
												}
											>
												{replyVerdicts[msg.id] === "approved"
													? t("mail.ai_verdict_approved", {
														defaultValue: "AI: Approve",
													})
													: replyVerdicts[msg.id] === "rejected"
														? t("mail.ai_verdict_rejected", {
															defaultValue: "AI: Decline",
														})
														: t("mail.ai_verdict_unclear", {
															defaultValue: "AI: Needs more info",
														})}
											</Badge>
										)}
										{msg.direction === "inbox" && isManualOverrideForMessage(msg.id) && (
											<Badge variant="outline">
												{t("mail.ai_verdict_manual_override", {
													defaultValue: "Manual override",
												})}
											</Badge>
										)}
									</div>
									{!isExpanded && (
										<p className="text-muted-foreground truncate text-xs">
											{msg.bodyText?.slice(0, 100) ||
												msg.bodyHtml?.replace(/<[^>]+>/g, "").slice(0, 100)}
										</p>
									)}
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<span className="text-muted-foreground text-xs">
										{dateStr}
									</span>
									{isExpanded ? (
										<ChevronUp className="text-muted-foreground size-4" />
									) : (
										<ChevronDown className="text-muted-foreground size-4" />
									)}
								</div>
							</button>

							{/* Expanded content */}
							{isExpanded && (
								<div className="border-border border-t px-4 py-3">
									{/* Full headers */}
									<div className="text-muted-foreground mb-3 grid gap-1 text-sm">
										<div className="flex gap-2">
											<span className="shrink-0 font-medium">
												{t("mail.from")}:
											</span>
											<span>{fromDisplay}</span>
										</div>
										<div className="flex gap-2">
											<span className="shrink-0 font-medium">
												{t("mail.to")}:
											</span>
											<span>{formatRecipientsJson(msg.toJson)}</span>
										</div>
										{msg.ccJson && (
											<div className="flex gap-2">
												<span className="shrink-0 font-medium">
													{t("mail.cc")}:
												</span>
												<span>{formatRecipientsJson(msg.ccJson)}</span>
											</div>
										)}
										<div className="flex gap-2">
											<span className="shrink-0 font-medium">
												{t("mail.date")}:
											</span>
											<span>{dateStr}</span>
										</div>
									</div>

									{/* Body */}
									<div className="prose prose-sm dark:prose-invert text-foreground max-w-none">
										<IsolatedEmailContent html={msg.bodyHtml} />
									</div>

									{/* Actions */}
									<div className="border-border mt-4 flex items-center gap-2 border-t pt-3">
										<Button variant="outline" size="sm" asChild>
											<Link to={`/mail/compose?replyTo=${msg.id}`}>
												<Reply className="mr-1 size-4" />
												{t("mail.reply", {
													defaultValue: "Reply",
												})}
											</Link>
										</Button>
										<Button variant="outline" size="sm" asChild>
											<Link to={`/mail/compose?replyAllTo=${msg.id}`}>
												<ReplyAll className="mr-1 size-4" />
												{t("mail.reply_all", {
													defaultValue: "Reply All",
												})}
											</Link>
										</Button>
										<Button variant="outline" size="sm" asChild>
											<Link to={`/mail/compose?forward=${msg.id}`}>
												<Forward className="mr-1 size-4" />
												{t("mail.forward", {
													defaultValue: "Forward",
												})}
											</Link>
										</Button>
										<div className="flex-1" />
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive hover:bg-destructive/10"
											onClick={() => setDeleteMessageId(msg.id)}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Relationships Section */}
			<div className="border-border bg-card mt-8 rounded-2xl border p-6 shadow-sm">
				<h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
					<span className="material-symbols-outlined text-primary">link</span>
					{t("common.sections.relationships", {
						defaultValue: "Linked Items",
					})}
				</h2>
				<RelationshipPicker
					relationAType="mail"
					relationAId={mainMessageId}
					relationAName={threadSubject}
					mode="edit"
					currentPath={`/mail/thread/${encodeURIComponent(threadId)}`}
					sections={[
						{
							type: "reimbursement",
							label: t("treasury.reimbursements.title"),
						},
						{ type: "transaction", label: t("treasury.transactions.title") },
						{ type: "event", label: t("events.title") },
						{ type: "minute", label: t("minutes.title") },
					].flatMap(({ type, label }) => {
						const relData = loaderData.relationships[type];
						if (!relData) return [];
						return [
							{
								relationBType: type as RelationshipEntityType,
								linkedEntities: (relData.linked || []) as unknown as AnyEntity[],
								availableEntities: (relData.available ||
									[]) as unknown as AnyEntity[],
								canWrite: relData.canWrite ?? false,
								createType: type,
								label,
							},
						];
					})}
					onLink={relationshipPicker.handleLink}
					onUnlink={relationshipPicker.handleUnlink}
					formData={relationshipPicker.toFormData()}
				/>
			</div>

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={!!deleteMessageId}
				onOpenChange={(open) => !open && setDeleteMessageId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("mail.delete")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("mail.delete_confirm")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteMessage}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{t("common.actions.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
