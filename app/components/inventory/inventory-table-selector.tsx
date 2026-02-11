import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { DataTable } from "~/components/ui/data-table";
import { EditableCell } from "~/components/ui/editable-cell";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SmartCombobox } from "~/components/ui/smart-combobox";
import { TableCell, TableRow } from "~/components/ui/table";
import type { InventoryItem } from "~/db";

interface InventoryTableSelectorProps {
	items: InventoryItem[];
	uniqueLocations: string[];
	uniqueCategories: string[];
	selectedIds: string[];
	onSelectionChange: (ids: string[]) => void;
	onAddItem?: (item: {
		name: string;
		quantity: number;
		location: string;
		category?: string;
		description?: string;
		value?: string;
	}) => Promise<InventoryItem | null>;
	onInlineEdit?: (itemId: string, field: string, value: string) => void;
	compact?: boolean;
	showUnlinkedBadge?: boolean;
}

export function InventoryTableSelector({
	items,
	uniqueLocations,
	uniqueCategories,
	selectedIds,
	onSelectionChange,
	onAddItem,
	onInlineEdit,
	compact = false,
	showUnlinkedBadge = false,
}: InventoryTableSelectorProps) {
	// State for inline add row
	const [showAddRow, setShowAddRow] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [newItem, setNewItem] = useState({
		name: "",
		quantity: "1",
		location: "",
		category: "",
		description: "",
		value: "0",
	});

	// Ref for the add row to detect outside clicks
	const addRowRef = useRef<HTMLTableRowElement>(null);

	// Flag to prevent duplicate saves
	const hasSavedRef = useRef(false);

	// State for filtering
	const [nameFilter, setNameFilter] = useState("");
	const [locationFilter, setLocationFilter] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("");

	// Filter items based on search
	const filteredItems = items.filter((item) => {
		const locationValue = item.location ?? "missing location";
		if (
			nameFilter &&
			!item.name.toLowerCase().includes(nameFilter.toLowerCase())
		)
			return false;
		if (
			locationFilter &&
			locationValue.toLowerCase() !== locationFilter.toLowerCase()
		)
			return false;
		if (
			categoryFilter &&
			(item.category || "").toLowerCase() !== categoryFilter.toLowerCase()
		)
			return false;
		return true;
	});

	// Handler for creating new item
	const handleCreateItem = async () => {
		if (
			!newItem.name.trim() ||
			!newItem.location.trim() ||
			!onAddItem ||
			hasSavedRef.current
		)
			return;

		hasSavedRef.current = true;
		setIsAdding(true);
		try {
			const createdItem = await onAddItem({
				name: newItem.name,
				quantity: parseInt(newItem.quantity, 10) || 1,
				location: newItem.location,
				category: newItem.category || undefined,
				description: newItem.description || undefined,
				value: newItem.value || "0",
			});

			if (createdItem) {
				// Auto-select the newly created item
				onSelectionChange([...selectedIds, createdItem.id]);
			}
			// Always reset form and close
			setNewItem({
				name: "",
				quantity: "1",
				location: "",
				category: "",
				description: "",
				value: "0",
			});
			setShowAddRow(false);
		} finally {
			setIsAdding(false);
			hasSavedRef.current = false;
		}
	};

	// Ref to track current newItem state for blur handler
	const newItemRef = useRef(newItem);
	newItemRef.current = newItem;

	const isAddingRef = useRef(isAdding);
	isAddingRef.current = isAdding;

	// Handler for blur on add row - save if clicking outside and required fields are filled
	const handleAddRowBlur = useCallback(
		(_e: React.FocusEvent) => {
			// Use setTimeout to allow the new focus target to be set
			setTimeout(async () => {
				// Prevent duplicate saves
				if (hasSavedRef.current || isAddingRef.current) return;

				// Check if the new focus target is still within the add row
				const addRow = addRowRef.current;
				if (!addRow) return;

				const activeElement = document.activeElement;
				const isStillInRow = addRow.contains(activeElement);

				// Check if focus is in a popover (SmartCombobox dropdown)
				const isInPopover =
					(activeElement as Element)?.closest(
						"[data-radix-popper-content-wrapper]",
					) || (activeElement as Element)?.closest('[role="listbox"]');

				// If focus moved outside the row (and not in a popover) and required fields are filled, save
				const currentItem = newItemRef.current;
				if (
					!isStillInRow &&
					!isInPopover &&
					currentItem.name.trim() &&
					currentItem.location.trim() &&
					onAddItem
				) {
					hasSavedRef.current = true;
					setIsAdding(true);
					try {
						const createdItem = await onAddItem({
							name: currentItem.name,
							quantity: parseInt(currentItem.quantity, 10) || 1,
							location: currentItem.location,
							category: currentItem.category || undefined,
							description: currentItem.description || undefined,
							value: currentItem.value || "0",
						});

						if (createdItem) {
							onSelectionChange([...selectedIds, createdItem.id]);
						}
						// Always reset and close the form after attempting to save
						setNewItem({
							name: "",
							quantity: "1",
							location: "",
							category: "",
							description: "",
							value: "0",
						});
						setShowAddRow(false);
					} finally {
						setIsAdding(false);
						hasSavedRef.current = false;
					}
				}
			}, 150);
		},
		[onAddItem, onSelectionChange, selectedIds],
	);

	// Build columns
	const columns: ColumnDef<InventoryItem>[] = [
		{
			accessorKey: "name",
			header: "Nimi / Name",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					{onInlineEdit ? (
						<EditableCell
							value={row.getValue("name")}
							onSave={(v) => onInlineEdit(row.original.id, "name", v)}
							items={items.map((i) => i.name)}
						/>
					) : (
						<span className="font-medium">{row.getValue("name")}</span>
					)}
					{showUnlinkedBadge && (
						<span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded">
							Uusi
						</span>
					)}
				</div>
			),
		},
		{
			accessorKey: "quantity",
			header: compact ? "Kpl" : "Määrä / Qty",
			cell: ({ row }) =>
				onInlineEdit ? (
					<Input
						type="number"
						min="1"
						className="w-20 h-8 text-center"
						defaultValue={row.getValue("quantity")}
						onBlur={(e) => {
							const newVal = parseInt(e.target.value, 10) || 1;
							if (newVal !== row.original.quantity) {
								onInlineEdit(row.original.id, "quantity", newVal.toString());
							}
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.currentTarget.blur();
							}
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span className="text-gray-600 dark:text-gray-400">
						{row.getValue("quantity")} kpl
					</span>
				),
		},
		{
			accessorKey: "location",
			header: compact ? "Sijainti" : "Sijainti / Location",
			cell: ({ row }) =>
				onInlineEdit ? (
					<EditableCell
						value={row.getValue("location") || ""}
						onSave={(v) => onInlineEdit(row.original.id, "location", v)}
						items={uniqueLocations}
					/>
				) : (
					<span>{row.getValue("location")}</span>
				),
		},
	];

	// Add value column if not compact
	if (!compact) {
		columns.push({
			accessorKey: "value",
			header: "Arvo / Value",
			cell: ({ row }) => {
				const value = row.getValue("value") as string | null;
				if (onInlineEdit) {
					return (
						<EditableCell
							value={value || "0"}
							onSave={(v) => onInlineEdit(row.original.id, "value", v)}
							type="number"
							min="0"
							step="0.01"
						/>
					);
				}
				if (!value || value === "0")
					return <span className="text-gray-400">-</span>;
				return (
					<span className="font-medium">
						{parseFloat(value).toFixed(2).replace(".", ",")} €
					</span>
				);
			},
		});
	}

	// Filter component
	const filterComponent = (
		<div
			className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}
		>
			<div className="space-y-1">
				<Label className="text-xs text-gray-500">Nimi / Name</Label>
				<Input
					placeholder="Hae nimellä..."
					value={nameFilter}
					onChange={(e) => setNameFilter(e.target.value)}
					className={compact ? "h-8 text-sm" : ""}
				/>
			</div>
			<div className="space-y-1">
				<Label className="text-xs text-gray-500">Sijainti / Location</Label>
				<SmartCombobox
					items={uniqueLocations}
					value={locationFilter}
					onValueChange={setLocationFilter}
					placeholder="Kaikki sijainnit..."
					searchPlaceholder="Etsi..."
					emptyText="Ei sijainteja"
					allowCustom={false}
				/>
			</div>
			{!compact && (
				<div className="space-y-1">
					<Label className="text-xs text-gray-500">Kategoria / Category</Label>
					<SmartCombobox
						items={uniqueCategories}
						value={categoryFilter}
						onValueChange={setCategoryFilter}
						placeholder="Kaikki kategoriat..."
						searchPlaceholder="Etsi..."
						emptyText="Ei kategorioita"
						allowCustom={false}
					/>
				</div>
			)}
		</div>
	);

	// Column count for the add row (selection checkbox + columns)
	const _totalColumns = columns.length + 1; // +1 for selection checkbox

	// Inline add row as prependedRow for DataTable
	const addRowTableRow =
		showAddRow && onAddItem ? (
			<TableRow
				ref={addRowRef}
				onBlur={handleAddRowBlur}
				className="bg-primary/5 hover:bg-primary/10 border-b-2 border-primary/20"
			>
				{/* Empty cell for checkbox column */}
				<TableCell className="w-10">
					<span className="material-symbols-outlined text-primary text-lg">
						add_circle
					</span>
				</TableCell>
				{/* Name with SmartCombobox */}
				<TableCell>
					<SmartCombobox
						items={items.map((i) => ({ value: i.name, label: i.name }))}
						value={newItem.name}
						onValueChange={(v) => setNewItem((prev) => ({ ...prev, name: v }))}
						placeholder="Nimi..."
						searchPlaceholder="Etsi..."
						emptyText="Uusi"
					/>
				</TableCell>
				{/* Quantity */}
				<TableCell className="w-24">
					<Input
						type="number"
						min="1"
						value={newItem.quantity}
						onChange={(e) =>
							setNewItem((prev) => ({ ...prev, quantity: e.target.value }))
						}
						className="h-9 w-20"
						placeholder="Kpl"
					/>
				</TableCell>
				{/* Location */}
				<TableCell>
					<SmartCombobox
						items={uniqueLocations}
						value={newItem.location}
						onValueChange={(v) =>
							setNewItem((prev) => ({ ...prev, location: v }))
						}
						placeholder="Sijainti..."
						searchPlaceholder="Etsi..."
						emptyText="Uusi"
					/>
				</TableCell>
				{/* Value (only if not compact) */}
				{!compact && (
					<TableCell className="w-28">
						<Input
							type="number"
							step="0.01"
							min="0"
							value={newItem.value}
							onChange={(e) =>
								setNewItem((prev) => ({ ...prev, value: e.target.value }))
							}
							className="h-9 w-24"
							placeholder="€"
						/>
					</TableCell>
				)}
				{/* Actions - uses remaining cells */}
				<TableCell className="text-right">
					<div className="flex items-center justify-end gap-1">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => {
								setNewItem({
									name: "",
									quantity: "1",
									location: "",
									category: "",
									description: "",
									value: "0",
								});
								setShowAddRow(false);
							}}
							className="h-8 px-2 text-gray-500"
						>
							<span className="material-symbols-outlined text-base">close</span>
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={handleCreateItem}
							disabled={
								!newItem.name.trim() || !newItem.location.trim() || isAdding
							}
							className="h-8"
						>
							{isAdding ? (
								<span className="material-symbols-outlined text-base animate-spin">
									sync
								</span>
							) : (
								<span className="material-symbols-outlined text-base">
									check
								</span>
							)}
						</Button>
					</div>
				</TableCell>
			</TableRow>
		) : null;

	return (
		<div className="space-y-4">
			{/* Header with Add button */}
			{onAddItem && (
				<div className="flex justify-between items-center">
					<p className="text-sm text-gray-500">
						{selectedIds.length > 0
							? `${selectedIds.length} tavaraa valittu / items selected`
							: `${filteredItems.length} tavaraa / items`}
					</p>
					<Button
						type="button"
						variant={showAddRow ? "secondary" : "outline"}
						size="sm"
						onClick={() => {
							if (!showAddRow) {
								// Reset flag when opening the add row
								hasSavedRef.current = false;
							}
							setShowAddRow(!showAddRow);
						}}
					>
						<span className="material-symbols-outlined text-base mr-1">
							{showAddRow ? "close" : "add"}
						</span>
						{showAddRow ? "Sulje" : "Lisää uusi"}
					</Button>
				</div>
			)}

			{/* Data Table with inline add row */}
			<DataTable
				columns={columns}
				data={filteredItems}
				pageSize={compact ? 5 : 10}
				isLoading={false}
				totalCount={filteredItems.length}
				currentPage={1}
				filterComponent={filterComponent}
				enableRowSelection={true}
				getRowId={(row: InventoryItem) => row.id}
				onSelectionChange={onSelectionChange}
				prependedRow={addRowTableRow}
				selectedIds={selectedIds}
			/>
		</div>
	);
}
