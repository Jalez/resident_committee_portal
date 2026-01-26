import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import type { AnalyticsSheet } from "~/lib/google.server";

interface AnalyticsHeaderProps {
    sheets: AnalyticsSheet[];
    selectedSheet: AnalyticsSheet | null;
    canExport: boolean;
}

export function AnalyticsHeader({
    sheets,
    selectedSheet,
    canExport,
}: AnalyticsHeaderProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Handle sheet selection
    const handleSheetChange = (sheetId: string) => {
        const params = new URLSearchParams();
        params.set("sheetId", sheetId);
        navigate(`/analytics?${params.toString()}`);
    };

    // Handle refresh
    const handleRefresh = () => {
        setIsRefreshing(true);
        const params = new URLSearchParams(searchParams);
        params.set("refresh", "true");
        navigate(`/analytics?${params.toString()}`);
        setTimeout(() => {
            params.delete("refresh");
            setIsRefreshing(false);
        }, 500);
    };

    // Handle export
    const handleExport = () => {
        if (!selectedSheet) return;
        const params = new URLSearchParams(searchParams);
        window.location.href = `/api/analytics/export?${params.toString()}`;
        toast.success("Export started");
    };

    return (
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div className="flex-1 max-w-md space-y-1">
                <Label htmlFor="sheet-select" className="text-sm font-medium">
                    Select Sheet
                </Label>
                <Select
                    value={selectedSheet?.id || ""}
                    onValueChange={handleSheetChange}
                >
                    <SelectTrigger id="sheet-select">
                        <SelectValue placeholder="Select a sheet..." />
                    </SelectTrigger>
                    <SelectContent>
                        {sheets.length === 0 ? (
                            <SelectItem value="none" disabled>
                                No sheets found in analytics folder
                            </SelectItem>
                        ) : (
                            sheets.map((sheet) => (
                                <SelectItem key={sheet.id} value={sheet.id}>
                                    {sheet.name}
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex gap-2 flex-wrap">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    <span className="material-symbols-outlined text-base mr-1">
                        refresh
                    </span>
                    {isRefreshing ? "..." : "Refresh"}
                </Button>

                {canExport && selectedSheet && (
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <span className="material-symbols-outlined text-base mr-1">
                            download
                        </span>
                        Export
                    </Button>
                )}

                {selectedSheet && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(selectedSheet.url, "_blank")}
                    >
                        <span className="material-symbols-outlined text-base mr-1">
                            open_in_new
                        </span>
                        Open
                    </Button>
                )}
            </div>
        </div>
    );
}
