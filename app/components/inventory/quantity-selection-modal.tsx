import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import type { InventoryItem } from "~/db";

interface ItemWithUnknown {
	item: InventoryItem;
	unknownQuantity: number;
}

interface QuantitySelectionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: ItemWithUnknown[];
	mode: "markNoTransaction" | "addTransaction" | "addToExisting";
	onConfirm: (selections: { itemId: string; quantity: number }[]) => void;
}

export function QuantitySelectionModal({
	open,
	onOpenChange,
	items,
	mode,
	onConfirm,
}: QuantitySelectionModalProps) {
	// Track quantity for each item
	const [quantities, setQuantities] = useState<Record<string, number>>({});
	const { t } = useTranslation();

	// Reset quantities when modal opens
	useEffect(() => {
		if (open) {
			const initial: Record<string, number> = {};
			items.forEach(({ item, unknownQuantity }) => {
				// Default to 1 or max if only 1 available
				initial[item.id] = Math.min(1, unknownQuantity);
			});
			setQuantities(initial);
		}
	}, [open, items]);

	const handleQuantityChange = (itemId: string, value: string) => {
		const numValue = parseInt(value, 10) || 0;
		const item = items.find((i) => i.item.id === itemId);
		const max = item?.unknownQuantity || 0;
		setQuantities((prev) => ({
			...prev,
			[itemId]: Math.min(Math.max(0, numValue), max),
		}));
	};

	const handleConfirm = () => {
		const selections = Object.entries(quantities)
			.filter(([_, qty]) => qty > 0)
			.map(([itemId, quantity]) => ({ itemId, quantity }));
		onConfirm(selections);
		onOpenChange(false);
	};

	const totalSelected = Object.values(quantities).reduce(
		(sum, qty) => sum + qty,
		0,
	);

	const title =
		mode === "markNoTransaction"
			? t("inventory.modals.quantity_selection.title_no_txn")
			: mode === "addToExisting"
				? t("inventory.modals.quantity_selection.title_existing")
				: t("inventory.modals.quantity_selection.title_txn");

	const description =
		mode === "markNoTransaction"
			? t("inventory.modals.quantity_selection.desc_no_txn")
			: mode === "addToExisting"
				? t("inventory.modals.quantity_selection.desc_existing")
				: t("inventory.modals.quantity_selection.desc_txn");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-full h-full max-w-none md:max-w-2xl p-0 md:p-6 rounded-none md:rounded-lg overflow-y-auto flex flex-col md:block">
				<div className="p-4 md:p-0 flex-1 overflow-y-auto">
					<DialogHeader className="mb-4 text-left">
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>

					<div className="py-4 md:max-h-[400px] overflow-y-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("inventory.columns.name")}</TableHead>
									<TableHead className="text-center">
										{t("inventory.modals.quantity_selection.available")}
									</TableHead>
									<TableHead className="text-center">
										{t("inventory.columns.quantity")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map(({ item, unknownQuantity }) => (
									<TableRow key={item.id}>
										<TableCell className="font-medium">{item.name}</TableCell>
										<TableCell className="text-center">
											<span className="text-amber-600 font-mono">
												{unknownQuantity}
											</span>
										</TableCell>
										<TableCell className="text-center">
											<Input
												type="number"
												min="0"
												max={unknownQuantity}
												value={quantities[item.id] || 0}
												onChange={(e) =>
													handleQuantityChange(item.id, e.target.value)
												}
												className="w-20 h-8 text-center mx-auto"
											/>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>

				<div className="p-4 md:p-0 border-t md:border-t-0 mt-auto">
					<DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-4">
						<span className="text-sm text-gray-500 order-2 sm:order-1">
							{t("inventory.columns.total")}:{" "}
							<span className="font-bold">{totalSelected}</span>
						</span>
						<div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
							<Button
								variant="outline"
								onClick={() => onOpenChange(false)}
								className="flex-1 sm:flex-none"
							>
								{t("inventory.modals.cancel")}
							</Button>
							<Button
								onClick={handleConfirm}
								disabled={totalSelected === 0}
								className="flex-1 sm:flex-none"
							>
								{mode === "markNoTransaction"
									? t("inventory.modals.quantity_selection.confirm")
									: t("inventory.modals.quantity_selection.continue")}
							</Button>
						</div>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
