export type RelationshipEntityType =
	| "receipt"
	| "transaction"
	| "reimbursement"
	| "budget"
	| "inventory"
	| "minute"
	| "news"
	| "faq"
	| "poll"
	| "social"
	| "event"
	| "mail";

export type InventoryItemStatus = "draft" | "active" | "removed" | "legacy";
export type RemovalReason = "broken" | "used_up" | "lost" | "sold" | "other";
export type PurchaseStatus =
	| "draft"
	| "pending"
	| "approved"
	| "reimbursed"
	| "rejected";
export type TransactionType = "income" | "expense";
export type TransactionStatus =
	| "draft"
	| "pending"
	| "complete"
	| "paused"
	| "declined";
export type ReimbursementStatus =
	| "not_requested"
	| "requested"
	| "approved"
	| "declined";
export type SubmissionType = "committee" | "events" | "purchases" | "questions";
export type SubmissionStatus =
	| "Uusi / New"
	| "Käsittelyssä / In Progress"
	| "Hyväksytty / Approved"
	| "Hylätty / Rejected"
	| "Valmis / Done";
export type MessageType =
	| "reimbursement_approved"
	| "reimbursement_declined"
	| "news_published"
	| "ai_news_translation_failed"
	| "ai_faq_translation_failed";
export type CommitteeMailDirection = "sent" | "inbox";
export type MailDraftType = "new" | "reply" | "replyAll" | "forward";
export type BudgetStatus = "draft" | "open" | "closed";
export type PollType = "managed" | "linked" | "external";
export type PollStatus = "active" | "closed" | "draft";
export type ReceiptStatus = "draft" | "active" | "archived";
export type MinuteStatus = "draft" | "active" | "archived";
export type EventStatus = "draft" | "active" | "cancelled" | "completed";
export type EventType = "meeting" | "social" | "private";

export interface Role {
	id: string;
	name: string;
	description: string | null;
	color: string;
	isSystem: boolean;
	sortOrder: number;
	permissions: string[];
	createdAt: Date;
	updatedAt: Date;
}

export type NewRole = Partial<Omit<Role, "id" | "createdAt" | "updatedAt">> & {
	name: string;
};

export interface User {
	id: string;
	email: string;
	name: string;
	apartmentNumber: string | null;
	description: string | null;
	picture: string | null;
	primaryLanguage: string;
	secondaryLanguage: string;
	localOllamaEnabled: boolean;
	localOllamaUrl: string;
	createdAt: Date;
	updatedAt: Date;
}

export type NewUser = Partial<Omit<User, "id" | "createdAt" | "updatedAt">> & {
	email: string;
	name: string;
};

export interface InventoryItem {
	id: string;
	name: string;
	quantity: number;
	manualCount: number;
	location: string | null;
	category: string | null;
	description: string | null;
	value: string | null;
	showInInfoReel: boolean;
	status: InventoryItemStatus;
	removedAt: Date | null;
	removalReason: RemovalReason | null;
	removalNotes: string | null;
	needsCompletion: boolean | null;
	completionNotes: string | null;
	purchasedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewInventoryItem = Partial<
	Omit<InventoryItem, "id" | "createdAt" | "updatedAt">
> & {
	name: string;
};

export interface Purchase {
	id: string;
	inventoryItemId: string | null;
	description: string | null;
	amount: string;
	purchaserName: string;
	bankAccount: string;
	minutesId: string;
	minutesName: string | null;
	notes: string | null;
	status: PurchaseStatus;
	emailSent: boolean | null;
	emailError: string | null;
	emailMessageId: string | null;
	emailReplyReceived: boolean | null;
	emailReplyContent: string | null;
	year: number;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewPurchase = Partial<
	Omit<Purchase, "id" | "createdAt" | "updatedAt">
> & {
	amount: string;
	purchaserName: string;
	bankAccount: string;
	minutesId: string;
	year: number;
};

export interface Transaction {
	id: string;
	year: number;
	type: TransactionType;
	amount: string;
	description: string;
	category: string | null;
	date: Date;
	status: TransactionStatus;
	reimbursementStatus: ReimbursementStatus | null;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewTransaction = Partial<
	Omit<Transaction, "id" | "createdAt" | "updatedAt">
> & {
	year: number;
	type: TransactionType;
	amount: string;
	description: string;
	date: Date;
};

export interface Submission {
	id: string;
	type: SubmissionType;
	name: string;
	email: string;
	apartmentNumber: string | null;
	message: string;
	status: SubmissionStatus;
	createdAt: Date;
	updatedAt: Date;
}

export type NewSubmission = Partial<
	Omit<Submission, "id" | "createdAt" | "updatedAt">
> & {
	type: SubmissionType;
	name: string;
	email: string;
	message: string;
};

export interface SocialLink {
	id: string;
	name: string;
	icon: string;
	url: string;
	color: string;
	sortOrder: number;
	isActive: boolean;
	isPrimary: boolean;
	status: "draft" | "active" | "archived";
	createdAt: Date;
	updatedAt: Date;
}

export type NewSocialLink = Partial<
	Omit<SocialLink, "id" | "createdAt" | "updatedAt">
> & {
	name: string;
	icon: string;
	url: string;
	color: string;
};

export interface News {
	id: string;
	title: string;
	summary: string | null;
	content: string;
	titleSecondary: string | null;
	summarySecondary: string | null;
	contentSecondary: string | null;
	createdBy: string | null;
	status: "draft" | "active" | "archived";
	createdAt: Date;
	updatedAt: Date;
}

export type NewNews = Partial<Omit<News, "id" | "createdAt" | "updatedAt">> & {
	title: string;
	content: string;
};

export interface Faq {
	id: string;
	question: string;
	answer: string;
	questionSecondary: string | null;
	answerSecondary: string | null;
	sortOrder: number;
	status: "draft" | "active" | "archived";
	createdAt: Date;
	updatedAt: Date;
}

export type NewFaq = Partial<Omit<Faq, "id" | "createdAt" | "updatedAt">> & {
	question: string;
	answer: string;
};

export interface Message {
	id: string;
	userId: string;
	type: MessageType;
	title: string;
	content: string;
	relatedPurchaseId: string | null;
	relatedNewsId: string | null;
	read: boolean;
	readAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewMessage = Partial<
	Omit<Message, "id" | "createdAt" | "updatedAt">
> & {
	userId: string;
	type: MessageType;
	title: string;
	content: string;
};

export interface CommitteeMailMessage {
	id: string;
	direction: CommitteeMailDirection;
	fromAddress: string;
	fromName: string | null;
	toJson: string;
	ccJson: string | null;
	bccJson: string | null;
	subject: string;
	bodyHtml: string;
	bodyText: string | null;
	date: Date;
	messageId: string | null;
	inReplyTo: string | null;
	referencesJson: string | null;
	threadId: string | null;
	createdAt: Date;
}

export type NewCommitteeMailMessage = Partial<
	Omit<CommitteeMailMessage, "id" | "createdAt">
> & {
	direction: CommitteeMailDirection;
	fromAddress: string;
	toJson: string;
	subject: string;
	bodyHtml: string;
	date: Date;
};

export interface MailDraft {
	id: string;
	toJson: string;
	ccJson: string | null;
	bccJson: string | null;
	subject: string | null;
	body: string | null;
	replyToMessageId: string | null;
	forwardFromMessageId: string | null;
	draftType: MailDraftType;
	updatedAt: Date;
	createdAt: Date;
}

export type NewMailDraft = Partial<
	Omit<MailDraft, "id" | "createdAt" | "updatedAt">
> & {
	toJson: string;
};

export interface FundBudget {
	id: string;
	name: string;
	description: string | null;
	amount: string;
	year: number;
	status: BudgetStatus;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewFundBudget = Partial<
	Omit<FundBudget, "id" | "createdAt" | "updatedAt">
> & {
	name: string;
	amount: string;
	year: number;
};

export interface BudgetTransaction {
	id: string;
	budgetId: string;
	transactionId: string;
	amount: string;
	createdAt: Date;
}

export interface Poll {
	id: string;
	name: string;
	description: string | null;
	type: PollType;
	googleFormId: string | null;
	externalUrl: string;
	analyticsSheetId: string | null;
	deadline: Date | null;
	status: PollStatus;
	year: number;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewPoll = Partial<Omit<Poll, "id" | "createdAt" | "updatedAt">> & {
	name: string;
	externalUrl: string;
	year: number;
};

export interface Receipt {
	id: string;
	status: ReceiptStatus;
	name: string | null;
	description: string | null;
	url: string | null;
	pathname: string | null;
	rawText: string | null;
	storeName: string | null;
	items: string | null;
	totalAmount: string | null;
	currency: string | null;
	purchaseDate: Date | null;
	aiModel: string | null;
	ocrProcessed: boolean | null;
	ocrProcessedAt: Date | null;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewReceipt = Partial<
	Omit<Receipt, "id" | "createdAt" | "updatedAt">
>;

export interface Minute {
	id: string;
	status: MinuteStatus;
	date: Date | null;
	title: string | null;
	description: string | null;
	fileUrl: string | null;
	fileKey: string | null;
	year: number | null;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewMinute = Partial<Omit<Minute, "id" | "createdAt" | "updatedAt">>;

export interface AppSetting {
	key: string;
	value: string | null;
	description: string | null;
	updatedAt: Date;
}

export interface EntityRelationship {
	id: string;
	relationAType: RelationshipEntityType;
	relationId: string;
	relationBType: RelationshipEntityType;
	relationBId: string;
	metadata: string | null;
	createdBy: string | null;
	createdAt: Date;
}

export type NewEntityRelationship = Partial<
	Omit<EntityRelationship, "id" | "createdAt">
> & {
	relationAType: RelationshipEntityType;
	relationId: string;
	relationBType: RelationshipEntityType;
	relationBId: string;
};

export interface UserRole {
	id: string;
	userId: string;
	roleId: string;
	createdAt: Date;
}

export type NewUserRole = Partial<Omit<UserRole, "id" | "createdAt">> & {
	userId: string;
	roleId: string;
};

export interface Event {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	isAllDay: boolean;
	startDate: Date;
	endDate: Date | null;
	recurrence: string | null;
	reminders: string | null;
	attendees: string | null;
	eventType: EventType;
	status: EventStatus;
	googleEventId: string | null;
	googleCalendarId: string | null;
	createdBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export type NewEvent = Partial<
	Omit<Event, "id" | "createdAt" | "updatedAt">
> & {
	title: string;
	startDate: Date;
};
