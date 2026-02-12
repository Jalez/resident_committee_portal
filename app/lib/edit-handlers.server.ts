import { redirect } from "react-router";
import type { ZodSchema } from "zod";
import { getDatabase, type DatabaseAdapter } from "~/db/server";
import { requirePermissionOrSelf } from "./auth.server";
import { SITE_CONFIG } from "./config.server";
import { getDraftAutoPublishStatus } from "./draft-auto-publish";
import { getRelationshipContextFromUrl } from "./linking/relationship-context";
import { loadRelationshipsForEntity } from "./relationships/load-relationships.server";
import { getRelationshipContext } from "./relationships/relationship-context.server";
import { saveRelationshipChanges } from "./relationships/save-relationships.server";

/**
 * Standardized redirect with success/error status for the ActionNotifier.
 */
export function redirectWithStatus(
    url: string,
    status: "success" | "error",
    messageKey?: string,
) {
    const targetUrl = new URL(url, "http://localhost"); // base doesn't matter for query params
    targetUrl.searchParams.set(status, messageKey || "true");

    // Remove the localhost part if it's a relative path
    const finalUrl = url.startsWith("/")
        ? targetUrl.pathname + targetUrl.search
        : targetUrl.toString();

    return redirect(finalUrl);
}

export interface EditLoaderConfig<T> {
    entityType: string;
    permission: string;
    permissionSelf?: string;
    db?: DatabaseAdapter;
    params: Record<string, string | undefined>;
    request: Request;
    fetchEntity: (db: DatabaseAdapter, id: string) => Promise<T | null>;
    relationshipTypes?: string[];
    extend?: (data: { db: DatabaseAdapter; entity: T; params: Record<string, string | undefined>; request: Request }) => Promise<Record<string, any>>;
}

export async function createEditLoader<T extends { id: string; status?: string }>({
    entityType,
    permission,
    permissionSelf,
    db = getDatabase(),
    params,
    request,
    fetchEntity,
    relationshipTypes = [],
    extend,
}: EditLoaderConfig<T>) {
    const entityId = params[`${entityType}Id` as keyof typeof params];
    if (!entityId) {
        throw new Response(`${entityType} ID required`, { status: 400 });
    }

    const entity = await fetchEntity(db, entityId);
    if (!entity) {
        throw new Response("Not Found", { status: 404 });
    }

    await requirePermissionOrSelf(
        request,
        permission,
        permissionSelf,
        (entity as any).createdBy,
        () => db,
    );

    // Relationships
    const relationships = await loadRelationshipsForEntity(
        db,
        entityType as any,
        entity.id,
        relationshipTypes as any[],
    );

    // Context and URL params
    const url = new URL(request.url);
    const sourceContext = getRelationshipContextFromUrl(url);

    // Smarter returnUrl logic
    let returnUrl = url.searchParams.get("returnUrl");
    if (!returnUrl) {
        const referer = request.headers.get("Referer");
        if (referer) {
            const refererUrl = new URL(referer);
            // Only use referer if it's from the same origin and not the current edit page
            if (refererUrl.origin === url.origin && !refererUrl.pathname.includes("/edit")) {
                returnUrl = refererUrl.pathname + refererUrl.search;
            }
        }
    }

    // Relationship context values (for autofill)
    const contextValues = await getRelationshipContext(
        db,
        entityType as any,
        entity.id,
    );

    let extraData = {};
    if (extend) {
        extraData = await extend({ db, entity, params, request });
    }

    return {
        siteConfig: SITE_CONFIG,
        [entityType]: entity,
        relationships,
        contextValues,
        sourceContext,
        returnUrl,
        ...extraData,
    };
}

export interface EditActionConfig<T> {
    entityType: string;
    permission: string;
    permissionSelf?: string;
    db?: DatabaseAdapter;
    params: Record<string, string | undefined>;
    request: Request;
    schema: ZodSchema;
    fetchEntity: (db: DatabaseAdapter, id: string) => Promise<T | null>;
    onUpdate: (data: { db: DatabaseAdapter; id: string; entity: T; data: any; formData: FormData; newStatus?: string }) => Promise<any>;
    beforeUpdate?: (data: { db: DatabaseAdapter; entity: T; formData: FormData; parsedData: any; newStatus?: string }) => Promise<any>;
    afterUpdate?: (data: { db: DatabaseAdapter; entity: T; formData: FormData; userId: string | null; parsedData: any; newStatus?: string }) => Promise<any>;
    successRedirect?: (entity: T) => string;
}

export async function createEditAction<T extends { id: string; status?: string }>({
    entityType,
    permission,
    permissionSelf,
    db = getDatabase(),
    params,
    request,
    schema,
    fetchEntity,
    onUpdate,
    beforeUpdate,
    afterUpdate,
    successRedirect,
}: EditActionConfig<T>) {
    const entityId = params[`${entityType}Id` as keyof typeof params];
    if (!entityId) throw new Response(`${entityType} ID required`, { status: 400 });

    const entity = await fetchEntity(db, entityId);
    if (!entity) {
        throw new Response("Not Found", { status: 404 });
    }

    const user = await requirePermissionOrSelf(
        request,
        permission,
        permissionSelf,
        (entity as any).createdBy,
        () => db,
    );

    const formData = await request.formData();
    const data: Record<string, any> = {};

    // Basic field extraction
    for (const [key, value] of formData.entries()) {
        if (!key.startsWith("_") && typeof value === "string") {
            data[key] = value;
        }
    }

    const result = schema.safeParse(data);
    if (!result.success) {
        return {
            error: "Validation failed",
            fieldErrors: result.error.flatten().fieldErrors,
        };
    }

    // Auto-publish logic
    let newStatus: string | undefined;
    if (entity.status === "draft") {
        newStatus = getDraftAutoPublishStatus(entityType as any, "draft", result.data as any) || undefined;
    }

    if (beforeUpdate) {
        const error = await beforeUpdate({ db, entity, formData, parsedData: result.data, newStatus });
        if (error) return error;
    }

    const onUpdateResult = await onUpdate({ db, id: entity.id, entity, data: result.data, formData, newStatus });
    if (onUpdateResult && typeof onUpdateResult === "object" && "error" in onUpdateResult) {
        return onUpdateResult;
    }

    // Save relationships
    await saveRelationshipChanges(
        db,
        entityType as any,
        entity.id,
        formData,
        user?.userId || null,
    );

    // Source context auto-link
    const sourceType = formData.get("_sourceType") as string | null;
    const sourceId = formData.get("_sourceId") as string | null;
    if (sourceType && sourceId) {
        const exists = await db.entityRelationshipExists(
            sourceType as any,
            sourceId,
            entityType as any,
            entity.id,
        );
        if (!exists) {
            await db.createEntityRelationship({
                relationAType: sourceType as any,
                relationId: sourceId,
                relationBType: entityType as any,
                relationBId: entity.id,
                createdBy: user?.userId || null,
            });
        }
    }

    if (afterUpdate) {
        await afterUpdate({ db, entity, formData, userId: user?.userId || null, parsedData: result.data, newStatus });
    }

    // Redirection logic
    const returnUrl = formData.get("_returnUrl") as string | null;
    if (returnUrl) {
        return redirectWithStatus(returnUrl, "success", "updated");
    }

    if (successRedirect) {
        return redirectWithStatus(successRedirect(entity), "success", "updated");
    }

    // Ultimate fallback to home if nothing else works
    return redirect("/");
}

export interface EmailActionConfig<T> {
    entityType: string;
    permission: string;
    permissionSelf?: string;
    db?: DatabaseAdapter;
    params: Record<string, string | undefined>;
    request: Request;
    fetchEntity: (db: DatabaseAdapter, id: string) => Promise<T | null>;
    onSend: (data: {
        db: DatabaseAdapter;
        id: string;
        entity: T;
        formData: FormData;
    }) => Promise<{ success: boolean; messageId?: string; error?: string }>;
    onSuccess?: (data: {
        db: DatabaseAdapter;
        id: string;
        entity: T;
        result: { success: boolean; messageId?: string; error?: string };
        formData: FormData;
    }) => Promise<any>;
    successRedirect?: (entity: T) => string;
}

export async function createEmailAction<T extends { id: string }>({
    entityType,
    permission,
    permissionSelf,
    db = getDatabase(),
    params,
    request,
    fetchEntity,
    onSend,
    onSuccess,
    successRedirect,
}: EmailActionConfig<T>) {
    const entityId = params[`${entityType}Id` as keyof typeof params];
    if (!entityId)
        throw new Response(`${entityType} ID required`, { status: 400 });

    const entity = await fetchEntity(db, entityId);
    if (!entity) {
        throw new Response("Not Found", { status: 404 });
    }

    await requirePermissionOrSelf(
        request,
        permission,
        permissionSelf,
        (entity as any).createdBy,
        () => db,
    );

    const formData = await request.formData();

    try {
        const result = await onSend({ db, id: entity.id, entity, formData });

        if (result.success) {
            if (onSuccess) {
                await onSuccess({ db, id: entity.id, entity, result, formData });
            }
            if (successRedirect) {
                return redirectWithStatus(
                    successRedirect(entity),
                    "success",
                    "sent",
                );
            }
            return { success: true };
        } else {
            return { error: result.error || "Email sending failed" };
        }
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
