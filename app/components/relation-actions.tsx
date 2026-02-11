import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ColoredStatusLinkBadge } from "~/components/colored-status-link-badge";
import type { LinkableItem } from "~/components/link-existing-selector";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { useDraft } from "~/contexts/form-draft-context";
import {
	type EntityType,
	encodeRelationshipContext,
} from "~/lib/linking/relationship-context";

export type TreasuryRelationItem = {
	to: string;
	title: string;
	status: string;
	id: string;
	icon?: string;
	variantMap?: Record<string, string>;
	description?: string | null;
	subtitle?: string | null;
};

type RelationActionsProps = {
	label: string;
	items: TreasuryRelationItem[];
	withSeparator?: boolean;
	mode?: "view" | "edit";
	/** URL to navigate to when "Add" is clicked (in edit mode) */
	addUrl?: string;
	/** Label for the add button */
	addLabel?: string;
	/** Current path to push to nav stack when navigating away */
	currentPath?: string;
	/** Custom handler for remove action */
	onRemove?: (id: string) => void;
	/** Items available for linking */
	linkableItems?: LinkableItem[];
	/** Callback when an existing item is selected */
	onSelectionChange?: (id: string) => void;
	/** Label for the link existing selector */
	linkExistingLabel?: string;
	/** Placeholder for the link existing selector */
	linkExistingPlaceholder?: string;
	/** Text for the "no link" option */
	noLinkText?: string;
	/** Optional key for persisting state in session storage */
	storageKey?: string;
	/** Custom handler for "Add" action (overrides addUrl) */
	onAdd?: () => void;
	/** Maximum number of items allowed (e.g. 1 for 1:1 relationships) */
	maxItems?: number;
	/** Source entity context for "Add" navigation */
	sourceEntityType?: EntityType;
	sourceEntityId?: string;
	sourceEntityName?: string;
	/** Import sources - third option alongside create/link */
	importSources?: Array<{
		label: string;
		icon: string;
		onClick: () => void;
	}>;
};

type RelationActionsState = {
	isExpanded: boolean;
	isLinking: boolean;
	selectedLinkId: string | null;
};

/**
 * Helper function to build addUrl with source context
 */
function buildAddUrl(
	baseUrl: string,
	source: { type?: EntityType; id?: string; name?: string },
): string {
	if (!source.type || !source.id) return baseUrl;

	const context = encodeRelationshipContext({
		type: source.type,
		id: source.id,
		name: source.name,
	});

	const separator = baseUrl.includes("?") ? "&" : "?";
	return `${baseUrl}${separator}source=${context}`;
}

export function RelationActions({
	label,
	items,
	withSeparator = false,
	mode = "view",
	addUrl,
	addLabel,
	currentPath,
	onRemove,
	linkableItems = [],
	onSelectionChange,
	linkExistingLabel,
	storageKey,
	onAdd,
	maxItems,
	sourceEntityType,
	sourceEntityId,
	sourceEntityName,
	importSources,
}: RelationActionsProps) {
	const { t } = useTranslation();

	const [isExpanded, setIsExpanded] = useState(false);
	const [isLinking, setIsLinking] = useState(false);
	const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
	const [isReady, setIsReady] = useState(false);

	// Persist state if storageKey is provided
	const { draft, saveDraft, isHydrated } = useDraft<RelationActionsState>(
		"relation-actions",
		storageKey || "default",
	);

	// Load draft state on mount/change
	useEffect(() => {
		if (storageKey && isHydrated) {
			if (draft) {
				setIsExpanded(draft.isExpanded);
				setIsLinking(draft.isLinking);
				setSelectedLinkId(draft.selectedLinkId);
			}
			setIsReady(true);
		}
	}, [draft, storageKey, isHydrated]);

	// Save draft state on change
	useEffect(() => {
		if (storageKey && isReady) {
			saveDraft({
				isExpanded,
				isLinking,
				selectedLinkId,
			});
		}
	}, [isExpanded, isLinking, selectedLinkId, saveDraft, storageKey, isReady]);

	// In view mode with no items, don't render anything
	if (mode === "view" && items.length === 0) return null;

	return (
		<>
			{withSeparator ? <Separator /> : null}
			<div className="space-y-2">
				<Label>{label}</Label>
				<div className="flex flex-wrap gap-2 items-center">
					{items.map((item) => (
						<ColoredStatusLinkBadge
							key={item.id}
							to={item.to}
							title={item.title}
							status={item.status}
							id={item.id}
							icon={item.icon}
							variantMap={item.variantMap}
							mode={mode}
							onRemove={onRemove}
							description={item.description}
							subtitle={item.subtitle}
							className="border-2 border-current"
						/>
					))}

					{mode === "edit" &&
						(maxItems === undefined || items.length < maxItems) &&
						(!isExpanded ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="rounded-full"
								onClick={() => setIsExpanded(true)}
							>
								<span className="material-symbols-outlined text-sm">add</span>
							</Button>
						) : (
							<div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200 border-2 border-dashed border-muted-foreground/30 rounded-md p-1">
								{!isLinking ? (
									<>
										{onAdd ? (
											<Button
												variant="ghost"
												size="sm"
												className="h-8"
												onClick={onAdd}
											>
												<span className="material-symbols-outlined mr-2 text-sm">
													add_circle
												</span>
												{addLabel || t("common.actions.create_new")}
											</Button>
										) : addUrl ? (
											<Button asChild variant="ghost" size="sm" className="h-8">
												<Link
													to={buildAddUrl(addUrl, {
														type: sourceEntityType,
														id: sourceEntityId,
														name: sourceEntityName,
													})}
													state={{ from: currentPath }}
												>
													<span className="material-symbols-outlined mr-2 text-sm">
														add_circle
													</span>
													{addLabel || t("common.actions.create_new")}
												</Link>
											</Button>
										) : null}

										{(addUrl || onAdd) && linkableItems.length > 0 && (
											<div className="relative flex items-center px-2">
												<Separator className="flex-1" />
												<span className="px-2 text-xs text-muted-foreground font-medium select-none">
													{t("common.or", "or")}
												</span>
												<Separator className="flex-1" />
											</div>
										)}

										{linkableItems.length > 0 && onSelectionChange && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-8"
												onClick={() => {
													setIsLinking(true);
													// Initialize with currently selected item if it exists in the list?
													// Currently we don't pass the selected ID back to this component easily without parsing items props.
													// Assuming fresh selection for now.
													setSelectedLinkId(null);
												}}
											>
												<span className="material-symbols-outlined mr-2 text-sm">
													link
												</span>
												{linkExistingLabel || t("common.actions.link_existing")}
											</Button>
										)}

										{importSources && importSources.length > 0 && (
											<>
												{(addUrl ||
													onAdd ||
													(linkableItems.length > 0 && onSelectionChange)) && (
													<div className="relative flex items-center px-2">
														<Separator className="flex-1" />
														<span className="px-2 text-xs text-muted-foreground font-medium select-none">
															{t("common.or", "or")}
														</span>
														<Separator className="flex-1" />
													</div>
												)}
												{importSources.map((source, idx) => (
													<Button
														key={idx}
														type="button"
														variant="ghost"
														size="sm"
														className="h-8"
														onClick={source.onClick}
													>
														<span className="material-symbols-outlined mr-2 text-sm">
															{source.icon}
														</span>
														{source.label}
													</Button>
												))}
											</>
										)}

										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-8 w-8 rounded-full"
											onClick={() => setIsExpanded(false)}
										>
											<span className="material-symbols-outlined text-sm">
												close
											</span>
										</Button>
									</>
								) : (
									<>
										<div className="flex flex-wrap items-center gap-2 px-1">
											{linkableItems.length > 0 ? (
												linkableItems.map((item) => (
													<ColoredStatusLinkBadge
														key={item.id}
														to={item.to} // Link to the item
														title={item.title || item.description || item.id}
														status={item.status}
														id={item.id}
														description={item.description || item.purchaserName}
														mode="view" // Suppress delete button
														onCheck={() =>
															setSelectedLinkId(
																selectedLinkId === item.id ? null : item.id,
															)
														}
														checked={selectedLinkId === item.id}
														variantMap={item.variantMap}
														className={
															selectedLinkId === item.id
																? "border-2 border-dashed border-current"
																: ""
														}
													/>
												))
											) : (
												<span className="text-xs text-muted-foreground px-2">
													{t("common.no_items", "No items available")}
												</span>
											)}
										</div>

										<div className="flex items-center border-l pl-1 ml-1 gap-1">
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-8 w-8 rounded-full text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
												disabled={!selectedLinkId}
												onClick={() => {
													if (selectedLinkId && onSelectionChange) {
														onSelectionChange(selectedLinkId);
														setIsLinking(false);
														setIsExpanded(false);
													}
												}}
												title={t("common.actions.confirm")}
											>
												<span className="material-symbols-outlined text-lg">
													check
												</span>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-8 w-8 rounded-full"
												onClick={() => {
													setIsLinking(false);
													setSelectedLinkId(null);
												}}
												title={t("common.actions.cancel")}
											>
												<span className="material-symbols-outlined text-sm">
													close
												</span>
											</Button>
										</div>
									</>
								)}
							</div>
						))}
				</div>
			</div>
		</>
	);
}
