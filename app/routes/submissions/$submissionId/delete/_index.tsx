import { createGenericDeleteAction, genericDeleteLoader } from "~/lib/actions/generic-delete.server";
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

export const loader = genericDeleteLoader;

// Submissions are not in ENTITY_REGISTRY directly as 'submission' type?
// Wait, I need to check if 'submission' is a valid entity type in schema.
// If not, I can't use generic action directly if it relies on ENTITY_SCHEMAS['submission'].
// Let's check schema first.
