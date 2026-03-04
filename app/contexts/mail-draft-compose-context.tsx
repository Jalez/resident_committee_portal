import { createContext, useContext, type ReactNode } from "react";
import type { RecipientEntry } from "~/components/committee-recipient-field";
import type { RelationAttachmentItem } from "~/components/mail/mail-attachments-panel";
import type { RelationshipEntityType } from "~/db/types";
import type {
	DraftAttachmentState,
	RelationAttachmentKey,
} from "~/lib/mail-draft-attachments";
import type { ComposeMode } from "~/lib/mail-draft-edit.server";

type RoleOption = { id: string; name: string };
type RecipientCandidate = { id: string; name: string; email: string };
type RelationshipSectionData = {
	linked?: unknown[];
	available?: unknown[];
	canWrite?: boolean;
};

export type MailDraftComposeContextValue = {
	composeMode: ComposeMode;
	draftId: string | null;
	relationAId: string;
	roles: RoleOption[];
	recipientCandidates: RecipientCandidate[];
	toRecipients: RecipientEntry[];
	ccRecipients: RecipientEntry[];
	bccRecipients: RecipientEntry[];
	subject: string;
	body: string;
	lastSavedAt: Date | null;
	relationships: Record<string, RelationshipSectionData | undefined>;
	attachmentState: DraftAttachmentState;
	relationAttachmentItems: RelationAttachmentItem[];
	excludedKeys: Set<string>;
	includedRelationAttachmentCount: number;
	missingRequiredReimbursementAttachments: boolean;
	canSubmit: boolean;
	isSubmitting: boolean;
	saveDisabled: boolean;
	setSubject: (value: string) => void;
	setBody: (value: string) => void;
	addToRecipients: (entries: { email: string; name?: string }[]) => void;
	addCcRecipients: (entries: { email: string; name?: string }[]) => void;
	addBccRecipients: (entries: { email: string; name?: string }[]) => void;
	removeToRecipient: (id: string) => void;
	removeCcRecipient: (id: string) => void;
	removeBccRecipient: (id: string) => void;
	getRecipientsForRole: (roleId: string, field: "to" | "cc" | "bcc") => void;
	handleAutofillSuggestions: (
		suggestions: Record<string, string | number | null>,
	) => void;
	handleDeleteDraft: () => void;
	handleManualSave: () => void;
	getRelationshipFormData: () => Record<string, string>;
	handleLink: (
		relationBType: RelationshipEntityType,
		relationBId: string,
		metadata?: Record<string, unknown>,
	) => void;
	handleUnlink: (
		relationBType: RelationshipEntityType,
		relationBId: string,
	) => void;
	uploadManualAttachment: (file: File | null) => void | Promise<void>;
	includeRelationAttachment: (key: RelationAttachmentKey) => void;
	excludeRelationAttachment: (key: RelationAttachmentKey) => void;
	removeManualAttachment: (id: string) => void | Promise<void>;
};

const MailDraftComposeContext =
	createContext<MailDraftComposeContextValue | null>(null);

export function MailDraftComposeProvider({
	value,
	children,
}: {
	value: MailDraftComposeContextValue;
	children: ReactNode;
}) {
	return (
		<MailDraftComposeContext.Provider value={value}>
			{children}
		</MailDraftComposeContext.Provider>
	);
}

export function useMailDraftCompose() {
	const context = useContext(MailDraftComposeContext);
	if (!context) {
		throw new Error(
			"useMailDraftCompose must be used within MailDraftComposeProvider",
		);
	}
	return context;
}
