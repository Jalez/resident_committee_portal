import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "~/components/ui/input";
import { SmartCombobox } from "~/components/ui/smart-combobox";

interface EditableCellProps {
	value: string;
	onSave: (newValue: string) => void;
	disabled?: boolean;
	items?: string[] | { label: string; value: string }[];
	type?: string;
	min?: string | number;
	step?: string | number;
}

export function EditableCell({
	value,
	onSave,
	disabled = false,
	items,
	type = "text",
	min,
	step,
}: EditableCellProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleSave = useCallback(() => {
		if (editValue !== value) {
			onSave(editValue);
		}
		setIsEditing(false);
	}, [editValue, value, onSave]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			// optionally select all?
			// inputRef.current.select()
		}
	}, [isEditing]);

	// Handle click outside for SmartCombobox mode (which uses portals)
	useEffect(() => {
		if (!isEditing || !items) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;

			// Check if click is inside the cell container
			if (containerRef.current?.contains(target)) {
				return;
			}

			// Check if click is inside a Radix Popover (SmartCombobox dropdown)
			// Radix renders popovers in portals, usually at the end of body
			// We look for the content wrapper or content
			const isInPopover =
				(target as Element).closest("[data-radix-popper-content-wrapper]") ||
				(target as Element).closest('[role="dialog"]'); // fallback

			if (isInPopover) {
				return;
			}

			// Click resulted in closing
			handleSave();
		};

		// Use mousedown to capture the event before blur/click handlers might interfere
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [
		isEditing,
		items, // Click resulted in closing
		handleSave,
	]); // Dependencies for handleSave closure

	// Reset edit value when value prop changes or editing closes
	useEffect(() => {
		if (!isEditing) {
			setEditValue(value);
		}
	}, [value, isEditing]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSave();
		} else if (e.key === "Escape") {
			setEditValue(value);
			setIsEditing(false);
		}
	};

	if (disabled) {
		return <span>{value || "-"}</span>;
	}

	if (isEditing) {
		if (items) {
			return (
				// biome-ignore lint/a11y/noStaticElementInteractions: This is a utility wrapper to stop propagation
				<div
					ref={containerRef}
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.stopPropagation();
						}
					}}
					className="min-w-[150px]"
				>
					<SmartCombobox
						items={items}
						value={editValue}
						onValueChange={setEditValue}
						placeholder="Valitse..."
						searchPlaceholder="Etsi..."
						emptyText="Uusi"
						className="h-8"
					/>
				</div>
			);
		}

		return (
			<Input
				ref={inputRef}
				type={type}
				min={min}
				step={step}
				value={editValue}
				onChange={(e) => setEditValue(e.target.value)}
				onBlur={handleSave}
				onKeyDown={handleKeyDown}
				onClick={(e) => e.stopPropagation()}
				className="h-8 py-0 px-2 text-sm min-w-[100px]"
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				setIsEditing(true);
			}}
			className="text-left hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded transition-colors cursor-text min-w-[60px] inline-block w-full h-full"
			title="Klikkaa muokataksesi / Click to edit"
		>
			{value || <span className="text-gray-400">-</span>}
		</button>
	);
}
