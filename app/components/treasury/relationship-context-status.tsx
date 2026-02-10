import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import type { RelationshipContextValues } from "~/lib/relationships/relationship-context.server";
import { cn } from "~/lib/utils";

interface RelationshipContextStatusProps {
    context: RelationshipContextValues | null;
    currentEntityValue?: {
        amount?: number | null;
        description?: string | null;
        date?: Date | null;
    };
    entityType: "receipt" | "reimbursement" | "transaction";
    entityId?: string;
}

export function RelationshipContextStatus({
    context,
    currentEntityValue,
    entityType,
}: RelationshipContextStatusProps) {
    if (!context) return null;

    // Check for divergence
    const amountMismatch = context.totalAmount !== null &&
        currentEntityValue?.amount !== undefined &&
        Math.abs((context.totalAmount || 0) - (currentEntityValue.amount || 0)) > 0.01;

    const isSource = context.valueSource === entityType;

    // Status color/icon
    let status: "synced" | "diverged" | "source" = "synced";
    if (isSource) status = "source";
    else if (amountMismatch) status = "diverged";

    return (
        <div className="flex items-center gap-2 text-sm mt-2 p-2 bg-muted/30 rounded-md border border-border/50">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help">
                            {status === "source" && (
                                <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Source of Truth
                                </Badge>
                            )}
                            {status === "synced" && (
                                <Badge variant="outline" className="bg-green-500/5 border-green-500/20 text-green-600 gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Synced
                                </Badge>
                            )}
                            {status === "diverged" && (
                                <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Value Mismatch
                                </Badge>
                            )}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                        <div className="space-y-2">
                            <p className="font-semibold">Relationship Context</p>
                            <div className="text-xs space-y-1">
                                <div className="grid grid-cols-2 gap-2">
                                    <span className="text-muted-foreground">Source:</span>
                                    <span className="capitalize">{context.valueSource}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <span className="text-muted-foreground">Amount:</span>
                                    <span className={cn(amountMismatch && "text-destructive font-bold")}>
                                        {context.totalAmount?.toFixed(2)} {context.currency}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {amountMismatch && (
                <div className="flex items-center text-xs text-muted-foreground ml-auto">
                    <span>Current: {currentEntityValue?.amount?.toFixed(2)}</span>
                    <ArrowRight className="w-3 h-3 mx-1" />
                    <span className="font-medium text-destructive">{context.totalAmount?.toFixed(2)}</span>
                </div>
            )}
        </div>
    );
}
