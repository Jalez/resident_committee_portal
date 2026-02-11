/**
 * Entity Relationship Analyzer
 *
 * Analyzes source entities to suggest related entities that should be created.
 * Based on the AI Relationship Design: AI enriches the RelationshipContext,
 * which then propagates to create draft entities.
 *
 * Design Philosophy:
 * - Context-Centric: Entities talk to the Context, not each other
 * - Determinism First: Prefer deterministic mappings over AI guesses
 * - AI as Enricher: AI fills semantic gaps (category, tags, entity suggestions)
 */

import type { DatabaseAdapter } from "~/db/adapters/types";
import type { RelationshipEntityType } from "~/db/schema";

/**
 * Suggestion for a new entity to create
 */
export interface EntitySuggestion {
	/** Type of entity to create */
	entityType: RelationshipEntityType;
	/** Display name for the suggested entity */
	name: string;
	/** Data to populate the draft entity */
	data: Record<string, unknown>;
	/** Confidence score 0-1 */
	confidence: number;
	/** Human-readable reasoning for the suggestion */
	reasoning: string;
	/** Optional metadata for the relationship link */
	metadata?: Record<string, unknown>;
}

/**
 * Result of analyzing an entity for relationships
 */
export interface AnalysisResult {
	/** List of suggested entities to create */
	suggestions: EntitySuggestion[];
	/** Enriched metadata about the source entity */
	enrichment?: {
		category?: string;
		tags?: string[];
		description?: string;
	};
	/** Any errors encountered during analysis */
	errors?: string[];
}

/**
 * Base interface for entity analyzers
 * Each entity type (Receipt, Transaction, etc.) implements this
 */
export interface EntityAnalyzer<T = unknown> {
	/**
	 * Analyze an entity and suggest related entities to create
	 * @param entity The source entity to analyze
	 * @param db Database adapter for querying related data
	 * @returns Analysis result with entity suggestions
	 */
	analyze(entity: T, db: DatabaseAdapter): Promise<AnalysisResult>;
}

/**
 * Get the appropriate analyzer for an entity type
 */
export function getAnalyzerForType(
	entityType: RelationshipEntityType,
): EntityAnalyzer | null {
	switch (entityType) {
		case "receipt":
			return receiptAnalyzer;
		case "reimbursement":
			return reimbursementAnalyzer;
		case "transaction":
			return transactionAnalyzer;
		case "minute":
			return minuteAnalyzer;
		case "budget":
		case "inventory":
		case "news":
		case "faq":
			// These types don't generate suggestions (they are consumers)
			return null;
		default:
			return null;
	}
}

import { minuteAnalyzer } from "./analyzers/minute-analyzer.server";
// Import individual analyzers
import { receiptAnalyzer } from "./analyzers/receipt-analyzer.server";
import { reimbursementAnalyzer } from "./analyzers/reimbursement-analyzer.server";
import { transactionAnalyzer } from "./analyzers/transaction-analyzer.server";
