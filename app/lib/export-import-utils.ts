/**
 * Standardized export/import API path derivation from pathname.
 * Convention: /api${pathname}/export and /api${pathname}/import.
 * No export/import on breakdown (aggregate view only).
 */

export interface ExportImportPaths {
	exportPath: string;
	importPath: string;
}

/**
 * Returns export and import API base paths for the given pathname, or null if this route has no export/import (e.g. breakdown).
 */
export function getExportImportPaths(
	pathname: string,
): ExportImportPaths | null {
	const normalized = pathname.replace(/\/$/, "") || "/";
	if (normalized === "/treasury/breakdown") {
		return null;
	}
	return {
		exportPath: `/api${normalized}/export`,
		importPath: `/api${normalized}/import`,
	};
}
