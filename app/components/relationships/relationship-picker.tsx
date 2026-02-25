import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useNavigate, useRevalidator } from "react-router";
import { toast } from "sonner";
import { RelationActions } from "~/components/relation-actions";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import type { RelationshipEntityType } from "~/db/types";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import {
	type AnyEntity,
	entityToLinkableItem,
	entityToRelationItem,
} from "~/lib/entity-converters";
import { ENTITY_REGISTRY } from "~/lib/entity-registry";
import type { EntityType } from "~/lib/linking/relationship-context";

export interface ImportSource {
	sourceType: RelationshipEntityType;
	label: string;
	icon: string;
	sourceEntityIds: string[];
}

export interface RelationshipSection {
	relationBType: RelationshipEntityType;
	linkedEntities: AnyEntity[];
	availableEntities: AnyEntity[];
	canWrite?: boolean;
	maxItems?: number;
	createType?: string;
	onUpload?: (file: File) => Promise<void>;
	label?: string;
	importSources?: ImportSource[];
}

export interface RelationshipPickerProps {
	relationAType: RelationshipEntityType;
	relationAId: string;
	relationAName?: string;
	sections: RelationshipSection[];
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
	storageKeyPrefix?: string;
	className?: string;
	formData?: Record<string, string>;
}

interface CreateDraftResponse {
	success: boolean;
	entity?: {
		id: string;
		type: RelationshipEntityType;
		name: string;
		status: string;
	};
	linked?: boolean;
	redirectUrl?: string;
	error?: string;
}

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
	const navigate = useNavigate();
	const revalidator = useRevalidator();
	const fetcher = useFetcher<CreateDraftResponse>();
	const importFetcher = useFetcher<ImportFromSourceResponse>();
	const linkFetcher = useFetcher<{
		success: boolean;
		error?: string;
		alreadyExists?: boolean;
	}>();
	const unlinkFetcher = useFetcher<{ success: boolean }>();

	const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

	const clearRemovedId = useCallback((id: string) => {
		setRemovedIds((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const onLinkRef = useRef(onLink);
	onLinkRef.current = onLink;
	const processedDraftRef = useRef<string | null>(null);
	const processedImportRef = useRef<string | null>(null);
	const [pendingLink, setPendingLink] = useState<{
		relationBType: RelationshipEntityType;
		relationBId: string;
	} | null>(null);
	const linkDataAtSubmitRef = useRef<typeof linkFetcher.data | undefined>(
		undefined,
	);

	// When a draft is created, track it and revalidate to get fresh data
	useEffect(() => {
		if (
			fetcher.data?.success &&
			fetcher.data.entity &&
			processedDraftRef.current !== fetcher.data.entity.id
		) {
			const entity = fetcher.data.entity;
			processedDraftRef.current = entity.id;
			clearRemovedId(entity.id);

			// Track the link for form submission
			onLinkRef.current?.(section.relationBType, entity.id);

			// Show success toast
			toast.success(
				t("common.relationships.draft_created", {
					defaultValue: "Draft created and linked",
				}),
			);

			// Revalidate to get fresh data from server
			revalidator.revalidate();

			if (fetcher.data.redirectUrl) {
				navigate(fetcher.data.redirectUrl);
			}
		} else if (fetcher.data?.error) {
			toast.error(
				t("common.relationships.create_failed", {
					defaultValue: "Failed to create draft",
				}),
			);
		}
	}, [
		fetcher.data,
		section.relationBType,
		revalidator,
		t,
		clearRemovedId,
		navigate,
	]);

	// When entities are imported, track them and revalidate
	useEffect(() => {
		if (importFetcher.data?.success && importFetcher.data.entities) {
			const key = importFetcher.data.entities
				.map((e) => e.id)
				.sort()
				.join(",");
			if (processedImportRef.current === key) return;
			processedImportRef.current = key;

			// Track the links for form submission
			for (const entity of importFetcher.data.entities) {
				clearRemovedId(entity.id);
				onLinkRef.current?.(section.relationBType, entity.id);
			}

			// Show success toast
			toast.success(
				t("common.relationships.imported", {
					count: importFetcher.data.entities.length,
					defaultValue: `{{count}} item(s) imported and linked`,
				}),
			);

			// Revalidate to get fresh data from server
			revalidator.revalidate();
		} else if (importFetcher.data?.error) {
			toast.error(
				t("common.relationships.import_failed", {
					defaultValue: "Failed to import items",
				}),
			);
		}
	}, [
		importFetcher.data,
		section.relationBType,
		revalidator,
		t,
		clearRemovedId,
	]);

	// Revalidate after link/unlink API calls succeed
	const prevLinkStateRef = useRef(linkFetcher.state);
	useEffect(() => {
		if (
			prevLinkStateRef.current !== "idle" &&
			linkFetcher.state === "idle" &&
			pendingLink
		) {
			const hasFreshResponseData =
				linkFetcher.data !== linkDataAtSubmitRef.current;

			if (hasFreshResponseData && linkFetcher.data?.success) {
				onLinkRef.current?.(
					pendingLink.relationBType,
					pendingLink.relationBId,
				);
				toast.success(
					t("common.relationships.linked", {
						defaultValue: "Item linked",
					}),
				);
				revalidator.revalidate();
			} else {
				toast.error(
					linkFetcher.data?.error ||
					t("common.relationships.link_failed", {
						defaultValue: "Failed to link item",
					}),
				);
			}
			setPendingLink(null);
		}
		prevLinkStateRef.current = linkFetcher.state;
	}, [linkFetcher.state, linkFetcher.data, pendingLink, revalidator, t]);

	const prevUnlinkStateRef = useRef(unlinkFetcher.state);
	useEffect(() => {
		if (
			prevUnlinkStateRef.current !== "idle" &&
			unlinkFetcher.state === "idle" &&
			unlinkFetcher.data
		) {
			if (unlinkFetcher.data.success) {
				toast.success(
					t("common.relationships.unlinked", {
						defaultValue: "Item unlinked",
					}),
				);
				revalidator.revalidate();
			} else {
				toast.error(
					(unlinkFetcher.data as any).error ||
					t("common.relationships.unlink_failed", {
						defaultValue: "Failed to unlink item",
					}),
				);
			}
		}
		prevUnlinkStateRef.current = unlinkFetcher.state;
	}, [unlinkFetcher.state, unlinkFetcher.data, revalidator, t]);

	const config = ENTITY_REGISTRY[section.relationBType];
	const storageKey = `${storageKeyPrefix}-${section.relationBType}`;

	// Filter out removed entities
	const visibleEntities = section.linkedEntities.filter(
		(entity) => !removedIds.has(entity.id),
	);

	const items = visibleEntities.map((entity) =>
		entityToRelationItem(section.relationBType, entity, currentPath),
	);

	const linkableItems = section.availableEntities.map((entity) =>
		entityToLinkableItem(section.relationBType, entity),
	);

	const handleAdd = () => {
		const formData = new FormData();
		formData.append("type", section.createType || section.relationBType);
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

	const importActions = (section.importSources || []).flatMap((source) =>
		source.sourceEntityIds.map((sourceId) => ({
			label: source.label,
			icon: source.icon,
			onClick: () => handleImport(source.sourceType, sourceId),
		})),
	);

	const handleRemove = async (id: string) => {
		const entity = section.linkedEntities.find((e) => e.id === id);
		const isDraft = entity && (entity as any).status === "draft";

		// Add to removed IDs for immediate UI feedback
		setRemovedIds((prev) => new Set([...prev, id]));

		// Call onUnlink to track the removal for form submission
		onUnlink?.(section.relationBType, id);

		// For drafts, immediately delete from database via API
		if (isDraft) {
			try {
				const response = await fetch(
					`/api/entities/${section.relationBType}/${id}`,
					{ method: "DELETE" },
				);
				const result = await response.json();

				if (response.ok && result.success) {
					toast.success(
						t("common.relationships.draft_removed", {
							defaultValue: "Draft removed",
						}),
					);
					revalidator.revalidate();
				} else {
					toast.error(
						t("common.relationships.remove_failed", {
							defaultValue: "Failed to remove draft",
						}),
					);
				}
			} catch (err) {
				console.error("[RelationshipPicker] Failed to delete draft:", err);
				toast.error(
					t("common.relationships.remove_failed", {
						defaultValue: "Failed to remove draft",
					}),
				);
			}
		} else {
			const fd = new FormData();
			fd.append("relationAType", relationAType);
			fd.append("relationAId", relationAId);
			fd.append("relationBType", section.relationBType);
			fd.append("relationBId", id);
			unlinkFetcher.submit(fd, {
				method: "POST",
				action: "/api/entities/unlink",
			});
		}
	};

	return (
		<RelationActions
			label={
				section.label ||
				t(config.pluralKey, {
					defaultValue: t(config.labelKey, {
						defaultValue: config.type,
					}),
				})
			}
			items={items}
			linkableItems={linkableItems}
			mode={section.canWrite === false ? "view" : mode}
			currentPath={currentPath}
			onRemove={handleRemove}
			onSelectionChange={(id) => {
				clearRemovedId(id);
				setPendingLink({
					relationBType: section.relationBType,
					relationBId: id,
				});
				linkDataAtSubmitRef.current = linkFetcher.data;

				const fd = new FormData();
				fd.append("relationAType", relationAType);
				fd.append("relationAId", relationAId);
				fd.append("relationBType", section.relationBType);
				fd.append("relationBId", id);
				linkFetcher.submit(fd, {
					method: "POST",
					action: "/api/entities/link",
				});
			}}
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
	const [isAddingNewType, setIsAddingNewType] = useState(false);
	const [pendingNewType, setPendingNewType] =
		useState<RelationshipEntityType | null>(null);
	const [confirmedNewType, setConfirmedNewType] =
		useState<RelationshipEntityType | null>(null);

	const sourceEntityType = relationAType as unknown as EntityType;

	const initialRelationships = React.useMemo(() => {
		const initials: any[] = [];
		for (const section of sections) {
			for (const entity of section.linkedEntities) {
				initials.push({
					relationBType: section.relationBType,
					relationBId: entity.id,
				});
			}
		}
		return initials;
	}, [sections]);

	const internalPicker = useRelationshipPicker({
		relationAType,
		relationAId,
		initialRelationships,
	});

	const sectionsWithPending = React.useMemo(() => {
		return sections.map((section) => {
			const pendingLinkIds = new Set(
				internalPicker.pendingLinks
					.filter((link) => link.relationBType === section.relationBType)
					.map((link) => link.relationBId),
			);

			const pendingUnlinkIds = new Set(
				internalPicker.pendingUnlinks
					.filter((unlink) => unlink.relationBType === section.relationBType)
					.map((unlink) => unlink.relationBId),
			);

			const effectiveLinked = new Map<string, AnyEntity>();

			for (const entity of section.linkedEntities) {
				if (!pendingUnlinkIds.has(entity.id)) {
					effectiveLinked.set(entity.id, entity);
				}
			}

			for (const entity of section.availableEntities) {
				if (pendingLinkIds.has(entity.id)) {
					effectiveLinked.set(entity.id, entity);
				}
			}

			const linkedIds = new Set(effectiveLinked.keys());

			return {
				...section,
				linkedEntities: Array.from(effectiveLinked.values()),
				availableEntities: section.availableEntities.filter(
					(entity) => !linkedIds.has(entity.id),
				),
			};
		});
	}, [sections, internalPicker.pendingLinks, internalPicker.pendingUnlinks]);

	const handleLink = (
		type: RelationshipEntityType,
		id: string,
		metadata?: Record<string, unknown>,
	) => {
		internalPicker.handleLink(type, id, metadata);
		onLink?.(type, id, metadata);
	};
	const handleUnlink = (type: RelationshipEntityType, id: string) => {
		internalPicker.handleUnlink(type, id);
		onUnlink?.(type, id);
	};
	const effectiveFormData = formData || internalPicker.toFormData();

	const { visibleSections, hiddenSections } = React.useMemo(() => {
		const visible: RelationshipSection[] = [];
		const hidden: RelationshipSection[] = [];

		for (const section of sectionsWithPending) {
			if (section.linkedEntities.length > 0) {
				visible.push(section);
			} else if (section.canWrite !== false) {
				hidden.push(section);
			}
		}

		return { visibleSections: visible, hiddenSections: hidden };
	}, [sectionsWithPending]);

	const handleCancelNewType = () => {
		setIsAddingNewType(false);
		setPendingNewType(null);
	};

	const handleConfirmNewType = () => {
		if (!pendingNewType) return;
		setConfirmedNewType(pendingNewType);
		setIsAddingNewType(false);
		setPendingNewType(null);
	};

	const resetAddTypeFlow = () => {
		setIsAddingNewType(false);
		setPendingNewType(null);
		setConfirmedNewType(null);
	};

	const confirmedSection = React.useMemo(() => {
		if (!confirmedNewType) return null;
		return sectionsWithPending.find((s) => s.relationBType === confirmedNewType);
	}, [sectionsWithPending, confirmedNewType]);

	const visibleTypeSet = React.useMemo(
		() => new Set(visibleSections.map((s) => s.relationBType)),
		[visibleSections],
	);

	const shouldShowConfirmedSection =
		!!confirmedSection && !visibleTypeSet.has(confirmedSection.relationBType);

	return (
		<div className={className}>
			<div className="space-y-4">
				{visibleSections.map((section) => (
					<RelationshipSectionComponent
						key={section.relationBType}
						section={section}
						relationAType={relationAType}
						relationAId={relationAId}
						relationAName={relationAName}
						mode={mode}
						currentPath={currentPath}
						onLink={handleLink}
						onUnlink={handleUnlink}
						storageKeyPrefix={storageKeyPrefix}
						sourceEntityType={sourceEntityType}
					/>
				))}

				{shouldShowConfirmedSection && confirmedSection && (
					<RelationshipSectionComponent
						key={`confirmed-${confirmedSection.relationBType}`}
						section={confirmedSection}
						relationAType={relationAType}
						relationAId={relationAId}
						relationAName={relationAName}
						mode={mode}
						currentPath={currentPath}
						onLink={(type, id, metadata) => {
							handleLink(type, id, metadata);
							resetAddTypeFlow();
						}}
						onUnlink={handleUnlink}
						storageKeyPrefix={storageKeyPrefix}
						sourceEntityType={sourceEntityType}
					/>
				)}
			</div>

			{mode === "edit" && hiddenSections.length > 0 && (
				<>
					<Separator className="my-4" />
					<div className="space-y-2">
						<Label className="text-muted-foreground">
							{t("common.relationships.add_type", "Add relation")}
						</Label>
						<div className="flex items-center gap-2">
							{!isAddingNewType ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 text-muted-foreground"
									onClick={() => setIsAddingNewType(true)}
								>
									<span className="material-symbols-outlined mr-2 text-sm">
										add
									</span>
									{t(
										"common.relationships.add_new_type",
										"Link new entity type",
									)}
								</Button>
							) : (
								<div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200 border-2 border-dashed border-muted-foreground/30 rounded-md p-1">
									<Select
										value={pendingNewType || ""}
										onValueChange={(val) =>
											setPendingNewType(val as RelationshipEntityType)
										}
									>
										<SelectTrigger className="h-8 w-[180px]">
											<SelectValue
												placeholder={t(
													"common.relationships.select_type",
													"Select type",
												)}
											/>
										</SelectTrigger>
										<SelectContent>
											{hiddenSections.map((section) => {
												const config = ENTITY_REGISTRY[section.relationBType];
												return (
													<SelectItem
														key={section.relationBType}
														value={section.relationBType}
													>
														<span className="flex items-center gap-2">
															<span className="material-symbols-outlined text-sm">
																{config.icon}
															</span>
															{t(config.pluralKey)}
														</span>
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>

									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8 rounded-full"
										onClick={handleConfirmNewType}
										title={t("common.actions.confirm", "Confirm")}
										disabled={!pendingNewType}
									>
										<span className="material-symbols-outlined text-sm">
											check
										</span>
									</Button>

									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8 rounded-full"
										onClick={handleCancelNewType}
										title={t("common.actions.cancel")}
									>
										<span className="material-symbols-outlined text-sm">
											close
										</span>
									</Button>
								</div>
							)}
						</div>
					</div>
				</>
			)}

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

			{effectiveFormData &&
				Object.entries(effectiveFormData).map(([key, value]) => (
					<input key={key} type="hidden" name={key} value={value} />
				))}
		</div>
	);
}
