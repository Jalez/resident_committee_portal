import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
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

    // Column visibility menu using Popover (stays open on click)
    const columnVisibilityMenu = (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start">
                    <span className="material-symbols-outlined text-base mr-1">view_column</span>
                    Sarakkeet
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
                <div className="space-y-1">
                    {COLUMN_KEYS.map((key) => {
                        // Hide staff-only columns from non-staff
                        if (!isStaff && (key === "unitValue" || key === "totalValue" || key === "showInInfoReel")) return null;
                        return (
                            <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                                <Checkbox
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

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
                <Label htmlFor="name-filter" className="text-xs text-gray-500">Nimi / Name</Label>
                <Input
                    id="name-filter"
                    placeholder="Hae nimellä..."
                    defaultValue={filters.name}
                    onChange={(e) => handleFilterChange("name", e.target.value)}
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="location-filter" className="text-xs text-gray-500">Sijainti / Location</Label>
                <Select value={filters.location} onValueChange={(value) => handleFilterChange("location", value === "all" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Kaikki sijainnit..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Kaikki sijainnit</SelectItem>
                        {uniqueLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label htmlFor="category-filter" className="text-xs text-gray-500">Kategoria / Category</Label>
                <Select value={filters.category} onValueChange={(value) => handleFilterChange("category", value === "all" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Kaikki kategoriat..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Kaikki kategoriat</SelectItem>
                        {uniqueCategories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-xs text-gray-500">Sarakkeet / Columns</Label>
                {columnVisibilityMenu}
            </div>
        </div>
    );
}
