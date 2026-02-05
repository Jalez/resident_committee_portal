"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

const INPUT_CLASS =
	"flex-1 min-w-[100px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 border-0 outline-none py-1 text-sm";

export interface TagPickerProps<TItem, TSuggestion> {
	selectedItems: TItem[];
	onRemove: (id: string) => void;
	getSuggestions: (query: string) => TSuggestion[];
	onSelectSuggestion: (suggestion: TSuggestion) => void;
	getItemId: (item: TItem) => string;
	getSuggestionKey: (suggestion: TSuggestion) => string;
	renderItem: (item: TItem) => ReactNode;
	renderSuggestion: (suggestion: TSuggestion) => ReactNode;
	label: string;
	placeholder?: string;
	listId: string;
	disabled?: boolean;
	/** Optional label width class (default: w-48) */
	labelClassName?: string;
	/** Empty state message when no suggestions match */
	emptySuggestionsText?: string;
	/** Optional function to get custom Badge className for each item */
	getBadgeClassName?: (item: TItem) => string;
}

export function TagPicker<TItem, TSuggestion>({
	selectedItems,
	onRemove,
	getSuggestions,
	onSelectSuggestion,
	getItemId,
	getSuggestionKey,
	renderItem,
	renderSuggestion,
	label,
	placeholder = "",
	listId,
	disabled = false,
	labelClassName = "w-48",
	emptySuggestionsText,
	getBadgeClassName,
}: TagPickerProps<TItem, TSuggestion>) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const suggestions = getSuggestions(query);
	const suggestionCount = suggestions.length;

	const clearBlurTimeout = useCallback(() => {
		if (blurTimeoutRef.current) {
			clearTimeout(blurTimeoutRef.current);
			blurTimeoutRef.current = null;
		}
	}, []);

	const closePopover = useCallback(() => {
		clearBlurTimeout();
		setOpen(false);
		setHighlightedIndex(0);
	}, [clearBlurTimeout]);

	const selectSuggestion = useCallback(
		(suggestion: TSuggestion) => {
			onSelectSuggestion(suggestion);
			setQuery("");
			setHighlightedIndex(0);
			closePopover();
			inputRef.current?.focus();
		},
		[onSelectSuggestion, closePopover],
	);

	// Keep highlighted index in bounds
	useEffect(() => {
		if (highlightedIndex >= suggestionCount && suggestionCount > 0) {
			setHighlightedIndex(suggestionCount - 1);
		} else if (highlightedIndex < 0) {
			setHighlightedIndex(0);
		}
	}, [suggestionCount, highlightedIndex]);

	const onInputKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
				if (suggestions.length > 0) setOpen(true);
				setHighlightedIndex(0);
				e.preventDefault();
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setHighlightedIndex((i) =>
					i < suggestions.length - 1 ? i + 1 : i,
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setHighlightedIndex((i) => (i > 0 ? i - 1 : 0));
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				if (suggestions.length > 0 && highlightedIndex < suggestions.length) {
					e.preventDefault();
					selectSuggestion(suggestions[highlightedIndex]);
				}
				if (e.key === "Tab" && suggestions.length === 0) return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				closePopover();
			}
		},
		[open, suggestions, highlightedIndex, selectSuggestion, closePopover],
	);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{label ? (
				<span
					className={cn(
						"shrink-0 truncate text-sm font-medium",
						labelClassName,
					)}
				>
					{label}:
				</span>
			) : null}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverAnchor asChild>
					<div
						role="listbox"
						aria-label={label}
						aria-multiselectable
						className={cn(
							"flex flex-1 min-w-[100px] flex-wrap items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 min-h-8 px-2 py-1",
							open && "ring-ring/50 ring-2 ring-offset-2",
							disabled && "opacity-50 cursor-not-allowed",
						)}
					>
						{selectedItems.map((item) => {
							const customClassName = getBadgeClassName?.(item);
							return (
								<Badge
									key={getItemId(item)}
									variant={customClassName ? undefined : "secondary"}
									role="option"
									className={cn(
										"inline-flex items-center gap-0.5 pr-0.5 text-xs shrink-0",
										customClassName,
									)}
								>
								<span className="max-w-[200px] truncate">
									{renderItem(item)}
								</span>
								{!disabled && (
									<button
										type="button"
										onClick={() => onRemove(getItemId(item))}
										className="rounded p-0.5 hover:bg-black/20 dark:hover:bg-white/20"
										aria-label="Remove"
									>
										<X className="size-3" />
									</button>
								)}
							</Badge>
							);
						})}
						{!disabled && (
							<input
								ref={inputRef}
								type="text"
								role="combobox"
								aria-expanded={open}
								aria-controls={listId}
								aria-autocomplete="list"
								aria-label={label}
								value={query}
								onChange={(e) => {
									setQuery(e.target.value);
									setOpen(true);
									setHighlightedIndex(0);
								}}
								onFocus={() => {
									clearBlurTimeout();
								}}
								onDoubleClick={() => {
									setOpen(true);
									setHighlightedIndex(0);
								}}
								onBlur={() => {
									blurTimeoutRef.current = setTimeout(
										() => setOpen(false),
										150,
									);
								}}
								onKeyDown={onInputKeyDown}
								className={INPUT_CLASS}
								placeholder={
									selectedItems.length === 0 ? placeholder : ""
								}
							/>
						)}
					</div>
				</PopoverAnchor>
				<PopoverContent
					id={listId}
					className="w-[var(--radix-popover-trigger-width)] max-h-[280px] overflow-auto p-0"
					align="start"
					onOpenAutoFocus={(e) => e.preventDefault()}
					onCloseAutoFocus={(e) => e.preventDefault()}
				>
					<div
						role="listbox"
						className="py-1"
						onMouseDown={(e) => e.preventDefault()}
					>
						{suggestions.length === 0 && query.trim() && (
							<div className="px-2 py-2 text-sm text-muted-foreground">
								{emptySuggestionsText ?? "No suggestions"}
							</div>
						)}
						{suggestions.map((item, idx) => {
							const isHighlighted = idx === highlightedIndex;
							return (
								<div
									key={getSuggestionKey(item)}
									role="option"
									tabIndex={0}
									aria-selected={isHighlighted}
									className={cn(
										"cursor-pointer px-2 py-2 text-sm",
										isHighlighted && "bg-accent text-accent-foreground",
									)}
									onMouseEnter={() => setHighlightedIndex(idx)}
									onClick={() => selectSuggestion(item)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											selectSuggestion(item);
										}
									}}
								>
									{renderSuggestion(item)}
								</div>
							);
						})}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
