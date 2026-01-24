"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "~/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export interface ComboboxItem {
	value: string;
	label: string;
	[key: string]: unknown;
}

interface SmartComboboxProps {
	items: (ComboboxItem | string)[];
	value: string;
	onValueChange: (value: string) => void;
	/** Called when an EXISTING item is selected from the list */
	onSelect?: (item: ComboboxItem | string) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	emptyText?: string;
	/** If true, allows selecting the typed text as a new value */
	allowCustom?: boolean;
	/** Text prefix for custom option, e.g. "Käytä" */
	customLabel?: string;
	/** Custom renderer for list items */
	renderItem?: (item: ComboboxItem | string) => React.ReactNode;
	className?: string;
	modal?: boolean;
}

export function SmartCombobox({
	items,
	value,
	onValueChange,
	onSelect,
	placeholder = "Valitse...",
	searchPlaceholder = "Etsi...",
	emptyText = "Ei tuloksia.",
	allowCustom = true,
	customLabel = "Käytä",
	renderItem,
	className,
	modal = false,
}: SmartComboboxProps) {
	const [open, setOpen] = React.useState(false);
	// We use the value prop as the search term initially if it's not in the list?
	// Actually, CommandInput usually manages its own state, but we want to control it for the "custom value" feature.
	// However, Shadcn Command uses `cmdkey` and internal filtering.
	// For "Add new", we usually need to listen to the input value of CommandInput.
	// But Shadcn CommandInput doesn't expose `onValueChange` easily for the search query independently of filtering?
	// Actually it does: `value` and `onValueChange`.

	// NOTE: We need to sync the search input with the current value if it's a custom value (not in list).
	// But if it IS in list, we might want to show the label.
	// Let's keep it simple: The button shows the current value. The popover input shows the current value allowing edit.

	// Normalized items
	const normalizedItems = React.useMemo(() => {
		return items.map((item) => {
			if (typeof item === "string") return { value: item, label: item };
			return item;
		});
	}, [items]);

	const displayValue = value; // logic to find label could go here if value is ID

	return (
		<Popover open={open} onOpenChange={setOpen} modal={modal}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className={cn("w-full justify-between", className)}
				>
					{displayValue || placeholder}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<Command>
					<CommandInput
						placeholder={searchPlaceholder}
						value={value}
						onValueChange={onValueChange}
					/>
					<CommandList>
						<CommandEmpty>
							<div className="py-2 px-2 text-sm">
								<span className="text-muted-foreground mr-2">{emptyText}</span>
								{allowCustom && value && (
									<button
										type="button"
										className="font-medium text-primary cursor-pointer hover:underline bg-transparent border-none p-0 inline text-sm"
										onMouseDown={(e) => {
											// onMouseDown prevents blur before click
											e.preventDefault();
											e.stopPropagation();
											onValueChange(value);
											setOpen(false);
										}}
										onClick={(e) => {
											e.stopPropagation();
											onValueChange(value);
											setOpen(false);
										}}
									>
										{customLabel} "{value}"
									</button>
								)}
							</div>
						</CommandEmpty>
						<CommandGroup>
							{normalizedItems.map((item) => (
								<CommandItem
									key={item.value}
									value={item.value} // Command uses this for filtering
									onSelect={(_currentValue) => {
										// currentValue from Command is usually lowercased value.
										// We should find the original item.
										// Shadcn Command `value` prop is the unique identifier.
										// NOTE: `onSelect` returns the `value` prop of CommandItem.

										// Use the original item value (preserve case)
										onValueChange(item.value);
										if (onSelect) {
											const original = items.find((i) =>
												typeof i === "string"
													? i === item.value
													: i.value === item.value,
											);
											if (original) onSelect(original);
										}
										setOpen(false);
									}}
								>
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											value === item.value ? "opacity-100" : "opacity-0",
										)}
									/>
									{renderItem ? renderItem(item) : item.label}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
