"use client";

import { useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { Button } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface ColorPickerProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
}

export function ColorPicker({
	value,
	onChange,
	disabled = false,
	className,
}: ColorPickerProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Popover open={isOpen && !disabled} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-full justify-start text-left font-normal",
						!value && "text-muted-foreground",
						disabled && "opacity-50 cursor-not-allowed",
						className,
					)}
					disabled={disabled}
					onClick={() => !disabled && setIsOpen(!isOpen)}
				>
					<div className="flex items-center gap-2">
						<div
							className="h-5 w-5 rounded border border-border shrink-0"
							style={{ backgroundColor: value || "#000000" }}
						/>
						<span className="uppercase text-sm tracking-wide">
							{value || "Select color"}
						</span>
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-64 p-3" align="start">
				<div className="space-y-3">
					<HexColorPicker
						color={value || "#000000"}
						onChange={onChange}
						style={{ width: "100%", height: 150 }}
					/>
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground">#</span>
						<HexColorInput
							color={value || "#000000"}
							onChange={onChange}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm uppercase shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="FF0000"
						/>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function ColorSwatch({
	color,
	label,
	selected,
	onClick,
}: {
	color: string;
	label: string;
	selected?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col items-center gap-1 p-2 rounded-lg transition-colors hover:bg-muted/50 cursor-pointer",
				selected && "bg-primary/10 ring-2 ring-primary",
			)}
		>
			<div
				className="h-8 w-8 rounded-lg border border-border shadow-sm"
				style={{ backgroundColor: color }}
			/>
			<span className="text-xs text-muted-foreground">{label}</span>
		</button>
	);
}
