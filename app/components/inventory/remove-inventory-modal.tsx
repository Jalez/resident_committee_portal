import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import type { InventoryItem, RemovalReason, Transaction } from "~/db";

interface TransactionLink {
	transaction: Transaction;
	quantity: number;
}

interface RemoveInventoryModalProps {
	item: InventoryItem;
	transactionLinks: TransactionLink[];
	isOpen: boolean;
	onClose: () => void;
}

export function RemoveInventoryModal({
	item,
	transactionLinks,
	isOpen,
	onClose,
}: RemoveInventoryModalProps) {
	const fetcher = useFetcher();
	const { t, i18n } = useTranslation();
	const [selectedRemovals, setSelectedRemovals] = useState<Map<string, number>>(
		new Map(),
	);
	const [reason, setReason] = useState<RemovalReason>("broken");
	const [notes, setNotes] = useState("");

	const REMOVAL_REASONS: { value: RemovalReason; label: string }[] = [
		{ value: "broken", label: t("inventory.modals.remove.reasons.broken") },
		{ value: "used_up", label: t("inventory.modals.remove.reasons.used_up") },
		{ value: "lost", label: t("inventory.modals.remove.reasons.lost") },
		{ value: "sold", label: t("inventory.modals.remove.reasons.sold") },
		{ value: "other", label: t("inventory.modals.remove.reasons.other") },
	];

	const totalToRemove = Array.from(selectedRemovals.values()).reduce(
		(sum, qty) => sum + qty,
		0,
	);
	const hasTransactionLinks = transactionLinks.length > 0;

	const handleQuantityChange = (
		transactionId: string,
		maxQty: number,
		newQty: number,
	) => {
		const validQty = Math.max(0, Math.min(maxQty, newQty));
		const updated = new Map(selectedRemovals);
		if (validQty === 0) {
			updated.delete(transactionId);
		} else {
			updated.set(transactionId, validQty);
		}
		setSelectedRemovals(updated);
	};

	const handleSubmit = () => {
		// Prepare removal data
		const removals = Array.from(selectedRemovals.entries()).map(
			([transactionId, quantity]) => ({
				transactionId,
				quantity,
			}),
		);

		fetcher.submit(
			{
				_action: "removeItem",
				itemId: item.id,
				reason,
				notes,
				removals: JSON.stringify(removals),
				totalToRemove: String(totalToRemove),
			},
			{ method: "POST" },
		);

		onClose();
	};

	const formatDate = (date: Date | string) => {
		const d = new Date(date);
		return d.toLocaleDateString(i18n.language);
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="w-full h-full max-w-none md:max-w-lg p-0 md:p-6 rounded-none md:rounded-lg overflow-y-auto flex flex-col md:block">
				<div className="p-4 md:p-0 flex-1 overflow-y-auto">
					<DialogHeader className="mb-4 text-left">
						<DialogTitle>{t("inventory.modals.remove.title")}</DialogTitle>
						<DialogDescription>
							<span className="font-medium">{item.name}</span> —{" "}
							{t("inventory.modals.remove.current_quantity")}:{" "}
							<span className="font-medium">{item.quantity}</span>
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 pb-4">
						{hasTransactionLinks ? (
							<>
								<div>
									<Label className="text-sm font-medium">
										{t("inventory.modals.remove.linked_transactions")}
									</Label>
									<p className="text-xs text-muted-foreground mb-2">
										{t("inventory.modals.remove.linked_desc")}
									</p>
								</div>

								<div className="space-y-2 max-h-64 overflow-y-auto border rounded-xl bg-gray-50 dark:bg-gray-900/50 p-2">
									{transactionLinks.map(({ transaction, quantity }) => {
										const selectedQty =
											selectedRemovals.get(transaction.id) || 0;
										return (
											<div
												key={transaction.id}
												className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg bg-white dark:bg-gray-800 shadow-sm"
											>
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm truncate">
														{transaction.description}
													</p>
													<p className="text-xs text-muted-foreground">
														{formatDate(transaction.date)} ·{" "}
														{transaction.type === "expense"
															? t("inventory.modals.remove.expense")
															: t("inventory.modals.remove.income")}{" "}
														· {t("inventory.modals.remove.linked")}: {quantity}{" "}
														kpl
													</p>
												</div>
												<div className="flex items-center gap-2 self-end sm:self-auto">
													<Button
														type="button"
														variant="outline"
														size="icon"
														className="h-8 w-8"
														onClick={() =>
															handleQuantityChange(
																transaction.id,
																quantity,
																selectedQty - 1,
															)
														}
														disabled={selectedQty === 0}
													>
														-
													</Button>
													<Input
														type="number"
														min={0}
														max={quantity}
														value={selectedQty}
														onChange={(e) =>
															handleQuantityChange(
																transaction.id,
																quantity,
																parseInt(e.target.value, 10) || 0,
															)
														}
														className="w-16 h-8 text-center"
													/>
													<Button
														type="button"
														variant="outline"
														size="icon"
														className="h-8 w-8"
														onClick={() =>
															handleQuantityChange(
																transaction.id,
																quantity,
																selectedQty + 1,
															)
														}
														disabled={selectedQty >= quantity}
													>
														+
													</Button>
												</div>
											</div>
										);
									})}
								</div>
							</>
						) : (
							<div className="p-4 border rounded-lg bg-muted/40 text-center">
								<p className="text-sm text-muted-foreground">
									{t("inventory.modals.remove.no_linked_txns")}
								</p>
								<p className="text-sm mt-2">
									{t("inventory.modals.remove.no_linked_desc")}
								</p>
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="reason">
								{t("inventory.modals.remove.reason")}
							</Label>
							<Select
								value={reason}
								onValueChange={(v) => setReason(v as RemovalReason)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{REMOVAL_REASONS.map((r) => (
										<SelectItem key={r.value} value={r.value}>
											{r.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="notes">
								{t("inventory.modals.remove.notes_optional")}
							</Label>
							<Textarea
								id="notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder={t("inventory.modals.remove.notes_placeholder")}
								rows={2}
							/>
						</div>

						{totalToRemove > 0 && (
							<div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
								<p className="text-sm font-medium text-amber-800 dark:text-amber-200">
									{t("inventory.modals.remove.removing")} {totalToRemove}{" "}
									{t("inventory.unit")}
								</p>
								{totalToRemove >= item.quantity && (
									<p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
										{t("inventory.modals.remove.item_will_be_removed")}
									</p>
								)}
							</div>
						)}
					</div>
				</div>

				<div className="p-4 md:p-0 border-t md:border-t-0 mt-auto">
					<DialogFooter className="gap-2 sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							className="flex-1 sm:flex-none"
						>
							{t("inventory.modals.cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleSubmit}
							disabled={hasTransactionLinks && totalToRemove === 0}
							className="flex-1 sm:flex-none"
						>
							{hasTransactionLinks
								? t("inventory.modals.remove.remove_count", {
										count: totalToRemove,
									})
								: t("inventory.modals.remove.remove_item")}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
