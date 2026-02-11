import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { RelationActions } from "~/components/relation-actions";
import type { RelationshipEntityType } from "~/db/schema";
import {
	type AnyEntity,
	entityToLinkableItem,
	entityToRelationItem,
} from "~/lib/entity-converters";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import type { EntityType } from "~/lib/linking/relationship-context";

/**
 * An import source that can provide data to pre-fill new items.
 * E.g. a linked receipt can provide line items to create inventory items.
 */
export interface ImportSource {
	/** Entity type to import from (e.g. "receipt") */
	sourceType: RelationshipEntityType;
	/** Label for the import button (e.g. "Import from receipt") */
	label: string;
	/** Icon for the import button (Material Symbol name) */
	icon: string;
	/** The linked source entity IDs available for import */
	sourceEntityIds: string[];
}

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
	/** Available import sources for this section */
	importSources?: ImportSource[];
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
	onLink?: (
		relationBType: RelationshipEntityType,
		relationBId: string,
		metadata?: Record<string, unknown>,
	) => void;
	/** Handler when a relationship is unlinked */
	onUnlink?: (
		relationBType: RelationshipEntityType,
		relationBId: string,
	) => void;
	/** Prefix for storage keys (for persisting picker state) */
	storageKeyPrefix?: string;
	/** Custom className */
	className?: string;
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
 * Response from import-from-source API
 */
interface ImportFromSourceResponse {
	success: boolean;
	entities?: Array<{
		id: string;
		type: RelationshipEntityType;
		name: string;
		status: string;
	}>;
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
	onLink?: (
		relationBType: RelationshipEntityType,
		relationBId: string,
		metadata?: Record<string, unknown>,
	) => void;
	onUnlink?: (
		relationBType: RelationshipEntityType,
		relationBId: string,
	) => void;
	storageKeyPrefix: string;
	sourceEntityType: EntityType;
}) {
	const { t } = useTranslation();
	const fetcher = useFetcher<CreateDraftResponse>();
	const importFetcher = useFetcher<ImportFromSourceResponse>();

	// Track locally created drafts
	const [localDrafts, setLocalDrafts] = useState<AnyEntity[]>([]);
	// Track removed item IDs (for immediate UI feedback)
	const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

	// Use ref to hold latest onLink to avoid stale closure and infinite re-render loop
	const onLinkRef = useRef(onLink);
	onLinkRef.current = onLink;
	const processedDraftRef = useRef<string | null>(null);
	const processedImportRef = useRef<string | null>(null);

	// Handle successful draft creation
	useEffect(() => {
		if (
			fetcher.data?.success &&
			fetcher.data.entity &&
			processedDraftRef.current !== fetcher.data.entity.id
		) {
			const entity = fetcher.data.entity;
			processedDraftRef.current = entity.id;

			const draftEntity = {
				id: entity.id,
				name: entity.name,
				status: entity.status,
				description: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as AnyEntity;

			setLocalDrafts((prev) => [...prev, draftEntity]);
			onLinkRef.current?.(section.relationBType, entity.id);
		}
	}, [fetcher.data, section.relationBType]);

	// Handle successful import
	useEffect(() => {
		if (importFetcher.data?.success && importFetcher.data.entities) {
			const key = importFetcher.data.entities
				.map((e) => e.id)
				.sort()
				.join(",");
			if (processedImportRef.current === key) return;
			processedImportRef.current = key;

			const newEntities = importFetcher.data.entities.map(
				(entity) =>
					({
						id: entity.id,
						name: entity.name,
						status: entity.status,
						description: null,
						createdAt: new Date(),
						updatedAt: new Date(),
					}) as AnyEntity,
			);

			setLocalDrafts((prev) => [...prev, ...newEntities]);
			for (const entity of importFetcher.data.entities) {
				onLinkRef.current?.(section.relationBType, entity.id);
			}
		}
	}, [importFetcher.data, section.relationBType]);

	const config = ENTITY_REGISTRY[section.relationBType];
	const storageKey = `${storageKeyPrefix}-${section.relationBType}`;

	// Merge server-side linked entities with locally created drafts
	const allLinkedEntities = [...section.linkedEntities, ...localDrafts];

	// Filter out removed items for immediate UI feedback
	const visibleEntities = allLinkedEntities.filter(
		(entity) => !removedIds.has(entity.id),
	);

	const items = visibleEntities.map((entity) =>
		entityToRelationItem(section.relationBType, entity, currentPath),
	);

	const linkableItems = section.availableEntities.map((entity) =>
		entityToLinkableItem(section.relationBType, entity),
	);

	// Handler for creating new entities via draft system
	const handleAdd = () => {
		const formData = new FormData();
		formData.append("type", section.relationBType);
		formData.append("sourceType", relationAType);
		formData.append("sourceId", relationAId);
		if (relationAName) formData.append("sourceName", relationAName);
		if (currentPath) formData.append("returnUrl", currentPath);
		formData.append("_fetcher", "true");

		fetcher.submit(formData, {
			method: "POST",
			action: "/api/entities/create-draft",
		});
	};

	// Handler for importing from a source entity
	const handleImport = (
		sourceType: RelationshipEntityType,
		sourceId: string,
	) => {
		const formData = new FormData();
		formData.append("targetType", section.relationBType);
		formData.append("sourceType", sourceType);
		formData.append("sourceId", sourceId);
		formData.append("relationAType", relationAType);
		formData.append("relationAId", relationAId);
		if (currentPath) formData.append("returnUrl", currentPath);

		importFetcher.submit(formData, {
			method: "POST",
			action: "/api/entities/import-from-source",
		});
	};

	// Build import source actions for RelationActions
	const importActions = (section.importSources || []).flatMap((source) =>
		source.sourceEntityIds.map((sourceId) => ({
			label: source.label,
			icon: source.icon,
			onClick: () => handleImport(source.sourceType, sourceId),
		})),
	);

	const _isCreating = fetcher.state !== "idle";
	const _isImporting = importFetcher.state !== "idle";

	// Handler for removing/unlinking entities
	const handleRemove = (id: string) => {
		console.log("[RelationshipPicker] handleRemove called with id:", id);
		console.log("[RelationshipPicker] Current localDrafts:", localDrafts);
		console.log(
			"[RelationshipPicker] section.relationBType:",
			section.relationBType,
		);

		// Add to removed IDs for immediate UI feedback
		setRemovedIds((prev) => new Set([...prev, id]));

		// Remove from local drafts if it exists
		const isLocalDraft = localDrafts.some((draft) => draft.id === id);
		console.log("[RelationshipPicker] Is local draft?", isLocalDraft);

		setLocalDrafts((prev) => {
			const filtered = prev.filter((draft) => draft.id !== id);
			console.log("[RelationshipPicker] Filtered localDrafts:", filtered);
			return filtered;
		});
		console.log("Removing", id);
		console.log(
			"[RelationshipPicker] Calling onUnlink with:",
			section.relationBType,
			id,
		);
		onUnlink?.(section.relationBType, id);
	};

	return (
		<RelationActions
			label={section.label || t(config.pluralKey)}
			items={items}
			linkableItems={linkableItems}
			mode={mode}
			currentPath={currentPath}
			onRemove={handleRemove}
			onSelectionChange={(id) => onLink?.(section.relationBType, id)}
			maxItems={section.maxItems}
			storageKey={storageKey}
			sourceEntityType={sourceEntityType}
			sourceEntityId={relationAId}
			sourceEntityName={relationAName}
			onAdd={config.supportsDraft ? handleAdd : undefined}
			addLabel={
				config.supportsDraft ? t("common.actions.create_new") : undefined
			}
			importSources={importActions.length > 0 ? importActions : undefined}
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
	storageKeyPrefix = "relationship-picker",
	className,
	formData,
}: RelationshipPickerProps) {
	const { t } = useTranslation();

	// Convert relationAType to EntityType for legacy RelationActions compatibility
	const sourceEntityType = relationAType as unknown as EntityType;

	return (
		<div className={className}>
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
