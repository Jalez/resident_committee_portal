import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { Purchase, Transaction } from "~/db";

export type LinkableItem = {
	id: string;
	description: string | null;
	amount: string;
	createdAt: Date;
	// Purchase-specific
	purchaserName?: string;
};

export interface LinkExistingSelectorProps {
	/** Items available for linking (purchases or transactions) */
	items: LinkableItem[];
	/** Currently selected item ID */
	selectedId: string;
	/** Callback when selection changes */
	onSelectionChange: (id: string) => void;
	/** Label for the selector */
	label?: string;
	/** Help text shown below the selector */
	helpText?: string;
	/** Placeholder for empty selection */
	placeholder?: string;
	/** Text for the "no link" option */
	noLinkText?: string;
	/** Whether the selector is disabled */
	disabled?: boolean;
}

/**
 * Universal component for selecting existing items (transactions or purchases) to link.
 * Used by:
 * - treasury/reimbursement/new: to link to existing transactions
 * - treasury/transactions/new: to link to existing reimbursement requests (purchases)
 * - treasury/transactions/$transactionId/edit: to link to existing reimbursement requests (purchases)
 */
export function LinkExistingSelector({
	items,
	selectedId,
	onSelectionChange,
	label,
	helpText,
	placeholder,
	noLinkText,
	disabled = false,
}: LinkExistingSelectorProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			{label && <Label className="text-base font-bold">{label}</Label>}
			{helpText && (
				<p className="text-sm text-gray-500 dark:text-gray-400">{helpText}</p>
			)}
			<Select
				value={selectedId || "none"}
				onValueChange={(val) => onSelectionChange(val === "none" ? "" : val)}
				disabled={disabled}
			>
				<SelectTrigger>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{noLinkText || "No link"}</SelectItem>
					{items.map((item) => (
						<SelectItem key={item.id} value={item.id}>
							<span className="flex items-center gap-2">
								<span className="font-medium">
									{item.description || item.purchaserName || item.id}
								</span>
								<span className="text-gray-500">—</span>
								<span className="text-sm text-gray-500">{item.amount} €</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/**
 * Helper to convert Purchase array to LinkableItem array
 */
export function purchasesToLinkableItems(purchases: Purchase[]): LinkableItem[] {
	return purchases.map((p) => ({
		id: p.id,
		description: p.description,
		amount: p.amount,
		createdAt: p.createdAt,
		purchaserName: p.purchaserName,
	}));
}

/**
 * Helper to convert Transaction array to LinkableItem array
 */
export function transactionsToLinkableItems(
	transactions: (Transaction & { purchaseId: string | null })[],
): LinkableItem[] {
	return transactions.map((t) => ({
		id: t.id,
		description: t.description,
		amount: t.amount,
		createdAt: t.createdAt,
	}));
}
