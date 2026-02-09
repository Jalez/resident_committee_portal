import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Info, CheckCircle2, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import type { RelationshipContext } from "~/lib/linking/relationship-context.server";
import { cn } from "~/lib/utils";
import { useFetcher } from "react-router";
import type { AIEnrichmentResult } from "~/lib/ai/relationship-analyzer.server";
import { toast } from "sonner";
import { useEffect } from "react";

interface RelationshipContextStatusProps {
    context: RelationshipContext | null;
    currentEntityValue?: {
        amount?: number | null;
        description?: string | null;
        date?: Date | null;
    };
    entityType: "receipt" | "reimbursement" | "transaction";
    entityId?: string; // Needed for analysis
}

export function RelationshipContextStatus({
    context,
    currentEntityValue,
    entityType,
    entityId
}: RelationshipContextStatusProps) {
    const fetcher = useFetcher<{ analysis: AIEnrichmentResult }>();

    useEffect(() => {
        if (fetcher.data?.analysis) {
            toast.success("AI Analysis Complete", {
                description: fetcher.data.analysis.reasoning
            });
            // In a real app, we'd probably want to auto-fill or offer to apply these changes.
            // For now, just showing the toast is the "MVP" step.
        }
    }, [fetcher.data]);

    const handleAnalyze = () => {
        if (!entityId) return;
        fetcher.submit(
            { entityType, entityId },
            { method: "POST", action: "/api/relationship/analyze" }
        );
    };

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

            {entityId && (
                <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-6 w-6 p-0 ml-2"
                    onClick={handleAnalyze}
                    disabled={fetcher.state !== "idle"}
                    title="Analyze with AI"
                >
                    <Sparkles className={cn("w-3 h-3 text-muted-foreground", fetcher.state !== "idle" && "animate-pulse")} />
                </Button>
            )}
        </div>
    );
}
