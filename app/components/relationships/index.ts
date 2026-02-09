/**
 * Central export point for relationship management components
 */

export { RelationshipPicker } from "./relationship-picker";
export type { RelationshipPickerProps, RelationshipSection } from "./relationship-picker";

export { AIAnalyzeButton } from "./ai-analyze-button";
export type { AIAnalyzeButtonProps } from "./ai-analyze-button";

export { useRelationshipPicker } from "~/hooks/use-relationship-picker";
export type {
	UseRelationshipPickerOptions,
	PendingLink,
	PendingUnlink,
	InitialRelationship,
} from "~/hooks/use-relationship-picker";
