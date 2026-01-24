import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import { COLUMN_KEYS, COLUMN_LABELS } from "./inventory-constants";
import { useInventory } from "./inventory-context";

export function InventoryFilters() {
	const {
		filters,
		uniqueLocations,
		uniqueCategories,
		visibleColumns,
		isStaff,
		handleFilterChange,
		toggleColumn,
	} = useInventory();

	const { t } = useTranslation();

	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

	// Count active filters for badge
	const activeFilterCount = [
		filters.name,
		filters.location,
		filters.category,
	].filter(Boolean).length;

	// Column visibility menu using Popover (stays open on click)
	const columnVisibilityMenu = (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="w-full justify-start">
					<span className="material-symbols-outlined text-base mr-1">
						view_column
					</span>
					{t("inventory.search.columns")}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-2">
				<div className="space-y-1">
					{COLUMN_KEYS.map((key) => {
						// Hide staff-only columns from non-staff
						if (
							!isStaff &&
							(key === "unitValue" ||
								key === "totalValue" ||
								key === "showInInfoReel")
						)
							return null;
						const id = `col-toggle-${key}`;
						return (
							<label
								key={key}
								htmlFor={id}
								className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
							>
								<Checkbox
									id={id}
									checked={visibleColumns.has(key)}
									onCheckedChange={() => toggleColumn(key)}
								/>
								<span className="text-sm">{COLUMN_LABELS[key]}</span>
							</label>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);

	// Shared filter fields component
	const filterFields = (
		<>
			<div className="space-y-1">
				<Label htmlFor="name-filter" className="text-xs text-gray-500">
					{t("inventory.search.name_label")}
				</Label>
				<Input
					id="name-filter"
					placeholder={t("inventory.search.name_placeholder")}
					defaultValue={filters.name}
					onChange={(e) => handleFilterChange("name", e.target.value)}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor="location-filter" className="text-xs text-gray-500">
					{t("inventory.search.location_label")}
				</Label>
				<Select
					value={filters.location}
					onValueChange={(value) =>
						handleFilterChange("location", value === "all" ? "" : value)
					}
				>
					<SelectTrigger>
						<SelectValue placeholder={t("inventory.search.location_all")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							{t("inventory.search.location_all")}
						</SelectItem>
						{uniqueLocations.map((loc) => (
							<SelectItem key={loc} value={loc}>
								{loc}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-1">
				<Label htmlFor="category-filter" className="text-xs text-gray-500">
					{t("inventory.search.category_label")}
				</Label>
				<Select
					value={filters.category}
					onValueChange={(value) =>
						handleFilterChange("category", value === "all" ? "" : value)
					}
				>
					<SelectTrigger>
						<SelectValue placeholder={t("inventory.search.category_all")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							{t("inventory.search.category_all")}
						</SelectItem>
						{uniqueCategories.map((cat) => (
							<SelectItem key={cat} value={cat}>
								{cat}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-1">
				<Label className="text-xs text-gray-500">
					{t("inventory.search.columns")}
				</Label>
				{columnVisibilityMenu}
			</div>
		</>
	);

	return (
		<>
			{/* Mobile: Sheet with filters */}
			<div className="md:hidden">
				<Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
					<SheetTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="w-full justify-between"
						>
							<div className="flex items-center gap-2">
								<span className="material-symbols-outlined text-base">
									filter_list
								</span>
								<span>{t("inventory.search.filters")}</span>
							</div>
							{activeFilterCount > 0 && (
								<span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
									{activeFilterCount}
								</span>
							)}
						</Button>
					</SheetTrigger>
					<SheetContent
						side="bottom"
						className="h-auto max-h-[80vh] overflow-y-auto"
					>
						<SheetHeader>
							<SheetTitle>{t("inventory.search.filters")}</SheetTitle>
						</SheetHeader>
						<div className="grid grid-cols-1 gap-4 mt-4 pb-4">
							{filterFields}
						</div>
					</SheetContent>
				</Sheet>
			</div>

			{/* Desktop: Inline grid */}
			<div className="hidden md:grid grid-cols-4 gap-4">{filterFields}</div>
		</>
	);
}
