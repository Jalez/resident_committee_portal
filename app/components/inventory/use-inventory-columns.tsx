import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";
import { useFormatDate } from "~/hooks/use-format-date";
import { RelationsColumn } from "~/components/relations-column";
import { Checkbox } from "~/components/ui/checkbox";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import type { InventoryItem } from "~/db";
import type { ColumnKey } from "./inventory-constants";



interface UseInventoryColumnsProps {
	visibleColumns: Set<ColumnKey>;
	canEdit?: boolean;
	isStaff: boolean;
	uniqueCategories: string[];
	itemNames: string[];
	// Transaction-specific stuff has been removed, using RelationsColumn for all relationships
	relationsMap?: Record<string, RelationBadgeData[]>;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
	if (status === "removed") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
				<span className="material-symbols-outlined text-sm">delete</span>
				{/* We need useTranslation here too, but it's a component. */}
				<StatusRemovedText />
			</span>
		);
	}
	// Active - show nothing (default state)
	return null;
}

function StatusRemovedText() {
	const { t } = useTranslation();
	return <>{t("inventory.status.removed")}</>;
}

export function useInventoryColumns({
	visibleColumns,
	isStaff,
	canEdit = false,
	uniqueCategories,
	itemNames,
	relationsMap = {},
}: UseInventoryColumnsProps): ColumnDef<InventoryItem>[] {
	const { t, i18n } = useTranslation();
	const { formatDate } = useFormatDate();

	// Build columns - order: status, name, location, category, description, updatedAt, unitValue, quantity, totalValue, showInInfoReel, actions
	const columns: ColumnDef<InventoryItem>[] = [];

	// Status column (always visible for staff)
	if (isStaff && visibleColumns.has("status")) {
		columns.push({
			accessorKey: "status",
			header: t("inventory.columns.status"),
			cell: ({ row }) => (
				<StatusBadge status={row.original.status || "active"} />
			),
		});
	}

	if (visibleColumns.has("name")) {
		columns.push({
			accessorKey: "name",
			header: t("inventory.columns.name"),
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<span className="font-medium">{row.getValue("name")}</span>
					{/* Show inline status badge for removed/legacy items */}
					{row.original.status !== "active" &&
						!visibleColumns.has("status") && (
							<StatusBadge status={row.original.status || "active"} />
						)}
				</div>
			),
		});
	}

	if (visibleColumns.has("location")) {
		columns.push({
			accessorKey: "location",
			header: t("inventory.columns.location"),
			cell: ({ row }) => <span>{row.getValue("location")}</span>,
		});
	}

	if (visibleColumns.has("category")) {
		columns.push({
			accessorKey: "category",
			header: t("inventory.columns.category"),
			cell: ({ row }) => <span>{row.getValue("category")}</span>,
		});
	}

	if (visibleColumns.has("description")) {
		columns.push({
			accessorKey: "description",
			header: t("inventory.columns.description"),
			cell: ({ row }) => (
				<span className="block max-w-xs break-words line-clamp-3">
					{row.getValue("description")}
				</span>
			),
		});
	}

	if (visibleColumns.has("updatedAt")) {
		columns.push({
			accessorKey: "updatedAt",
			header: t("inventory.columns.updated"),
			cell: ({ row }) => {
				const date = new Date(row.getValue("updatedAt"));
				return (
					<span className="text-gray-500 text-xs text-nowrap">
						{formatDate(date)}
					</span>
				);
			},
		});
	}

	// Staff-only columns

	if (visibleColumns.has("quantity")) {
		columns.push({
			accessorKey: "quantity",
			header: t("inventory.columns.quantity"),
			cell: ({ row }) => (
				<span className="w-20 text-center inline-block">
					{row.getValue("quantity")}
				</span>
			),
		});
	}

	columns.push({
		id: "relations",
		header: t("common.relations.title"),
		cell: ({ row }) => (
			<RelationsColumn relations={relationsMap[row.original.id] || []} />
		),
	});

	if (isStaff && visibleColumns.has("showInInfoReel")) {
		columns.push({
			accessorKey: "showInInfoReel",
			header: t("inventory.columns.info_reel"),
			cell: ({ row }) => (
				<Form
					method="post"
					className="flex justify-center"
					onClick={(e) => e.stopPropagation()}
				>
					<input type="hidden" name="_action" value="toggleInfoReel" />
					<input type="hidden" name="itemId" value={row.original.id} />
					<Checkbox
						checked={row.original.showInInfoReel}
						disabled={row.original.status !== "active"}
						onCheckedChange={() => {
							// Find the closest form and submit it
							const form = document
								.querySelector(`form input[value="${row.original.id}"]`)
								?.closest("form");
							if (form) (form as HTMLFormElement).requestSubmit();
						}}
					/>
				</Form>
			),
		});
	}

	return columns;
}
