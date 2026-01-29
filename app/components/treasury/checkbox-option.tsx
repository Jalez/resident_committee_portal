import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";

interface CheckboxOptionProps {
	/** Unique ID for the checkbox */
	id: string;
	/** Name attribute for form submission */
	name?: string;
	/** Whether the checkbox is checked */
	checked: boolean;
	/** Callback when checkbox state changes */
	onCheckedChange: (checked: boolean) => void;
	/** Label text for the checkbox */
	label: string;
	/** Help text shown below the label */
	helpText?: string;
	/** Content to show when checkbox is checked (e.g., form fields) */
	children?: React.ReactNode;
	/** Whether to show a divider above the children content */
	showDivider?: boolean;
}

/**
 * Reusable checkbox option component with label, help text, and optional conditional content.
 * Used for options like "Request reimbursement" or "Create transaction" that show additional
 * form fields when checked.
 */
export function CheckboxOption({
	id,
	name,
	checked,
	onCheckedChange,
	label,
	helpText,
	children,
	showDivider = true,
}: CheckboxOptionProps) {
	return (
		<>
			<div className="flex items-center gap-3">
				<Checkbox
					id={id}
					name={name || id}
					checked={checked}
					onCheckedChange={(checked) => onCheckedChange(checked === true)}
				/>
				<Label htmlFor={id} className="text-lg font-bold cursor-pointer">
					{label}
				</Label>
			</div>

			{helpText && (
				<p className="text-sm text-gray-500 dark:text-gray-400">{helpText}</p>
			)}

			{checked && children && (
				<div className={showDivider ? "pt-4 border-t border-gray-200 dark:border-gray-700" : "pt-4"}>
					{children}
				</div>
			)}
		</>
	);
}
