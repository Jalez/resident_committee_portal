/**
 * Types that are safe to import in client-side code.
 * This file has no dependencies on server-only packages like drizzle-orm or postgres.
 */

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
