import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { getDatabase } from "~/db/server.server";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

export async function loader({ request }: Route.LoaderArgs) {
	// Only allow treasury managers
	await requirePermissionOrSelf(
		request,
		"treasury:manage",
		"treasury:manage",
		null,
		getDatabase,
	);
	return {};
}

export default function MigrateRelationships() {
	return (
		<PageWrapper>
			<div className="max-w-xl mx-auto p-4">
				<PageHeader title="Migrate Legacy Relationships" />

				<div className="bg-card border rounded-xl p-6 space-y-4">
					<div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-blue-700 dark:text-blue-300">
						<p className="font-semibold">Migration Complete</p>
						<p className="mt-2 text-sm">
							The legacy foreign key columns (purchaseId) have been removed from
							the database. All relationships are now managed through the
							entity_relationships table.
						</p>
						<p className="mt-2 text-sm">
							This migration tool is no longer needed and will be removed in a
							future update.
						</p>
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
