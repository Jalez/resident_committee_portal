import { useEffect, useState } from "react";
import { Form } from "react-router";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { InventoryItem } from "~/db";

interface MarkNoTransactionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: InventoryItem | null;
	unknownQuantity: number;
}

export function MarkNoTransactionDialog({
	open,
	onOpenChange,
	item,
	unknownQuantity,
}: MarkNoTransactionDialogProps) {
	const [quantityToAdd, setQuantityToAdd] = useState<string>("1");

	// Reset when opening for a new item
	useEffect(() => {
		if (open && item) {
			// Default to max possible if small, otherwise 1
			setQuantityToAdd(unknownQuantity > 0 ? "1" : "0");
		}
	}, [open, item, unknownQuantity]);

	if (!item) return null;

	const maxQuantity = unknownQuantity;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						Merkitse ei tapahtumaa / Mark No Transaction
					</DialogTitle>
					<DialogDescription>
						Merkitse määrä, jolla ei ole rahastotapahtumaa (esim. vanha tavara
						tai lahjoitus).
						<br />
						Mark quantity that has no transaction (e.g. legacy item or
						donation).
					</DialogDescription>
				</DialogHeader>

				<div className="py-4">
					<div className="flex flex-col gap-4">
						<div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800 text-sm">
							<p className="font-medium text-amber-800 dark:text-amber-300 mb-1">
								Tuntematon määrä / Unknown Quantity: {unknownQuantity}
							</p>
							<p className="text-amber-700 dark:text-amber-400">
								Voit merkitä enintään {unknownQuantity} kappaletta.
								<br />
								You can mark up to {unknownQuantity} items.
							</p>
						</div>

						<div className="grid w-full items-center gap-1.5">
							<Label htmlFor="quantity">Määrä / Quantity</Label>
							<Input
								id="quantity"
								type="number"
								min="1"
								max={maxQuantity}
								value={quantityToAdd}
								onChange={(e) => setQuantityToAdd(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Peruuta / Cancel
					</Button>
					<Form method="post" onSubmit={() => onOpenChange(false)}>
						<input type="hidden" name="_action" value="markManualCount" />
						<input type="hidden" name="itemId" value={item.id} />
						<input type="hidden" name="quantityToAdd" value={quantityToAdd} />
						<Button
							type="submit"
							disabled={
								parseInt(quantityToAdd, 10) > maxQuantity ||
								parseInt(quantityToAdd, 10) <= 0
							}
						>
							Vahvista / Confirm
						</Button>
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
