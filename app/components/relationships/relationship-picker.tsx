import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import type { RelationshipEntityType } from "~/db/schema";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import { entityToRelationItem, entityToLinkableItem, type AnyEntity } from "~/lib/entity-converters";
import { RelationActions } from "~/components/relation-actions";
import { AIAnalyzeButton } from "./ai-analyze-button";
import type { EntityType } from "~/lib/linking/relationship-context";

/**
 * Configuration for a section of related entities
 */
export interface RelationshipSection {
	/** The type of entities in this section */
	relationBType: RelationshipEntityType;
	/** Entities that are currently linked */
	linkedEntities: AnyEntity[];
	/** Entities that are available to link */
	availableEntities: AnyEntity[];
	/** Maximum number of items allowed (e.g., 1 for 1:1 relationships) */
	maxItems?: number;
	/** Entity type string for draft creation (defaults to relationBType) */
	createType?: string;
	/** Handler for file uploads (for receipts/minutes) */
	onUpload?: (file: File) => Promise<void>;
	/** Custom label override */
	label?: string;
}

/**
 * Props for the RelationshipPicker component
 */
export interface RelationshipPickerProps {
	/** The type of the source entity */
	relationAType: RelationshipEntityType;
	/** The ID of the source entity */
	relationAId: string;
	/** The name/title of the source entity (for context) */
	relationAName?: string;
	/** Sections of relationships to display */
	sections: RelationshipSection[];
	/** View or edit mode */
	mode?: "view" | "edit";
	/** Current path for navigation stack */
	currentPath?: string;
	/** Handler when a relationship is linked */
	onLink?: (relationBType: RelationshipEntityType, relationBId: string, metadata?: Record<string, unknown>) => void;
	/** Handler when a relationship is unlinked */
	onUnlink?: (relationBType: RelationshipEntityType, relationBId: string) => void;
	/** Whether to show the AI analyze button */
	showAnalyzeButton?: boolean;
	/** Prefix for storage keys (for persisting picker state) */
	storageKeyPrefix?: string;
	/** Custom className */
	className?: string;
	/** Callback when AI analysis completes */
	onAnalyzeComplete?: (result: {
		success: boolean;
		createdCount: number;
		created: Array<{ type: string; id: string; name: string }>;
		errors?: string[];
	}) => void;
	/** Form data to render as hidden inputs */
	formData?: Record<string, string>;
}

/**
 * Response from create-draft API
 */
interface CreateDraftResponse {
	success: boolean;
	entity?: {
		id: string;
		type: RelationshipEntityType;
		name: string;
		status: string;
	};
	linked?: boolean;
	error?: string;
}

/**
 * Individual section component that handles its own draft creation
 */
function RelationshipSectionComponent({
	section,
	relationAType,
	relationAId,
	relationAName,
	mode,
	currentPath,
	onLink,
	onUnlink,
	storageKeyPrefix,
	sourceEntityType,
}: {
	section: RelationshipSection;
	relationAType: RelationshipEntityType;
	relationAId: string;
	relationAName?: string;
	mode?: "view" | "edit";
	currentPath?: string;
	onLink?: (relationBType: RelationshipEntityType, relationBId: string, metadata?: Record<string, unknown>) => void;
	onUnlink?: (relationBType: RelationshipEntityType, relationBId: string) => void;
	storageKeyPrefix: string;
	sourceEntityType: EntityType;
}) {
	const { t } = useTranslation();
	const fetcher = useFetcher<CreateDraftResponse>();
	
	// Track locally created drafts
	const [localDrafts, setLocalDrafts] = useState<AnyEntity[]>([]);

	// Handle successful draft creation
	useEffect(() => {
		if (fetcher.data?.success && fetcher.data.entity) {
			const entity = fetcher.data.entity;
			
			// Create a minimal entity object that matches AnyEntity shape
			const draftEntity = {
				id: entity.id,
				name: entity.name,
				status: entity.status,
				description: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as AnyEntity;

			// Add to local drafts
			setLocalDrafts(prev => [...prev, draftEntity]);
			
			// Call onLink to add to pending links
			onLink?.(section.relationBType, entity.id);
		}
	}, [fetcher.data, fetcher.state, section.relationBType, onLink]);

	const config = ENTITY_REGISTRY[section.relationBType];
	const storageKey = `${storageKeyPrefix}-${section.relationBType}`;

	// Merge server-side linked entities with locally created drafts
	const allLinkedEntities = [...section.linkedEntities, ...localDrafts];

	// Convert entities to the format expected by RelationActions
	const items = allLinkedEntities.map((entity) =>
		entityToRelationItem(section.relationBType, entity)
	);

	const linkableItems = section.availableEntities.map((entity) =>
		entityToLinkableItem(section.relationBType, entity)
	);

	// Handler for creating new entities via draft system
	const handleAdd = () => {
		const formData = new FormData();
		formData.append("type", section.relationBType);
		formData.append("sourceType", relationAType);
		formData.append("sourceId", relationAId);
		if (relationAName) formData.append("sourceName", relationAName);
		
		fetcher.submit(formData, {
			method: "POST",
			action: "/api/entities/create-draft",
		});
	};

	const isCreating = fetcher.state !== "idle";

	return (
		<RelationActions
			label={section.label || t(config.pluralKey)}
			items={items}
			linkableItems={linkableItems}
			mode={mode}
			currentPath={currentPath}
			onRemove={(id) => onUnlink?.(section.relationBType, id)}
			onSelectionChange={(id) => onLink?.(section.relationBType, id)}
			maxItems={section.maxItems}
			storageKey={storageKey}
			sourceEntityType={sourceEntityType}
			sourceEntityId={relationAId}
			sourceEntityName={relationAName}
			onAdd={config.supportsDraft ? handleAdd : undefined}
			addLabel={config.supportsDraft ? t("common.actions.create_new") : undefined}
			withSeparator
		/>
	);
}

/**
 * Universal relationship picker component
 * Replaces entity-specific pickers with a unified interface
 */
export function RelationshipPicker({
	relationAType,
	relationAId,
	relationAName,
	sections,
	mode = "view",
	currentPath,
	onLink,
	onUnlink,
	showAnalyzeButton = false,
	storageKeyPrefix = "relationship-picker",
	className,
	onAnalyzeComplete,
	formData,
}: RelationshipPickerProps) {
	const { t } = useTranslation();

	// Convert relationAType to EntityType for legacy RelationActions compatibility
	const sourceEntityType = relationAType as unknown as EntityType;

	return (
		<div className={className}>
			{/* AI Analyze Button - Only show in edit mode when relationId exists */}
			{showAnalyzeButton && mode === "edit" && relationAId && (
				<div className="mb-4">
					<AIAnalyzeButton
						entityType={relationAType}
						entityId={relationAId}
						onComplete={onAnalyzeComplete}
						variant="outline"
						size="sm"
					/>
				</div>
			)}

			{/* Relationship Sections */}
			<div className="space-y-4">
				{sections.map((section) => (
					<RelationshipSectionComponent
						key={section.relationBType}
						section={section}
						relationAType={relationAType}
						relationAId={relationAId}
						relationAName={relationAName}
						mode={mode}
						currentPath={currentPath}
						onLink={onLink}
						onUnlink={onUnlink}
						storageKeyPrefix={storageKeyPrefix}
						sourceEntityType={sourceEntityType}
					/>
				))}
			</div>

			{/* File Upload Inputs (hidden, triggered by upload handlers) */}
			{sections
				.filter((section) => section.onUpload)
				.map((section) => (
					<input
						key={`upload-${section.relationBType}`}
						type="file"
						hidden
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file && section.onUpload) {
								section.onUpload(file);
							}
						}}
					/>
				))}

			{/* Form data hidden inputs */}
			{formData &&
				Object.entries(formData).map(([key, value]) => (
					<input key={key} type="hidden" name={key} value={value} />
				))}
		</div>
	);
}
