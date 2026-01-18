import { useFetcher } from "react-router";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import type { InventoryItem } from "~/db";

interface MarkAsLegacyDialogProps {
    item: InventoryItem | null;
    isOpen: boolean;
    onClose: () => void;
}

export function MarkAsLegacyDialog({ item, isOpen, onClose }: MarkAsLegacyDialogProps) {
    const fetcher = useFetcher();

    const handleConfirm = () => {
        if (!item) return;

        fetcher.submit(
            {
                _action: "markLegacy",
                itemId: item.id,
            },
            { method: "POST" }
        );
        onClose();
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Merkitse legacy-tavaraksi / Mark as Legacy Item</AlertDialogTitle>
                    <AlertDialogDescription>
                        {item ? (
                            <>
                                <span className="font-medium text-foreground">{item.name}</span>
                                <br /><br />
                                Tämä tavara merkitään "legacy"-tavaraksi, mikä tarkoittaa että se oli
                                varastossa ennen kuin kassatapahtumia alettiin seurata. Legacy-tavarat
                                eivät näy kun luodaan uusia tapahtumia.
                                <br /><br />
                                This item will be marked as a "legacy" item, meaning it existed before
                                treasury records were kept. Legacy items won't appear when creating new
                                transactions.
                            </>
                        ) : (
                            "Valitse ensin tavara."
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Peruuta / Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirm} disabled={!item}>
                        Merkitse legacy / Mark as Legacy
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
