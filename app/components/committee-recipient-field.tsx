"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export type RecipientEntry = { id: string; email: string; name?: string };

type RoleOption = { id: string; name: string };
type PersonOption = { id: string; name: string; email: string };

type SuggestionItem =
	| { type: "role"; roleId: string; label: string }
	| { type: "person"; user: PersonOption }
	| { type: "email"; email: string };

const INPUT_CLASS =
	"flex-1 min-w-[100px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 border-0 outline-none py-1 text-sm";

export interface RecipientFieldProps {
	field: "to" | "cc" | "bcc";
	recipients: RecipientEntry[];
	onAdd: (entries: { email: string; name?: string }[]) => void;
	onRemove: (id: string) => void;
	roles: RoleOption[];
	recipientCandidates: PersonOption[];
	onGetRecipientsForRole: (roleId: string) => void;
	listId: string;
	label: string;
}

function filterRoles(roles: RoleOption[], q: string): RoleOption[] {
	const lower = q.trim().toLowerCase();
	if (!lower) return roles;
	return roles.filter((r) => r.name.toLowerCase().includes(lower));
}

function filterPeople(people: PersonOption[], q: string): PersonOption[] {
	const lower = q.trim().toLowerCase();
	if (!lower) return people;
	return people.filter(
		(p) =>
			p.name.toLowerCase().includes(lower) ||
			p.email.toLowerCase().includes(lower),
	);
}

function looksLikeEmail(s: string): boolean {
	return s.trim().includes("@");
}

export function RecipientField({
	field: _field,
	recipients,
	onAdd,
	onRemove,
	roles,
	recipientCandidates,
	onGetRecipientsForRole,
	listId,
	label,
}: RecipientFieldProps) {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const suggestions = useMemo((): SuggestionItem[] => {
		const q = query.trim();
		const roleItems = filterRoles(roles, q).map((r) => ({
			type: "role" as const,
			roleId: r.id,
			label: r.name,
		}));
		const personItems = filterPeople(recipientCandidates, q).map((p) => ({
			type: "person" as const,
			user: p,
		}));
		const emailItem: SuggestionItem[] =
			q && looksLikeEmail(q)
				? [{ type: "email", email: q.toLowerCase().trim() }]
				: [];
		return [...roleItems, ...personItems, ...emailItem];
	}, [query, roles, recipientCandidates]);

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

	const addBySuggestion = useCallback(
		(item: SuggestionItem) => {
			if (item.type === "role") {
				onGetRecipientsForRole(item.roleId);
			} else if (item.type === "person") {
				onAdd([{ email: item.user.email, name: item.user.name }]);
			} else {
				onAdd([{ email: item.email }]);
			}
			setQuery("");
			setHighlightedIndex(0);
			closePopover();
			inputRef.current?.focus();
		},
		[onAdd, onGetRecipientsForRole, closePopover],
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
					addBySuggestion(suggestions[highlightedIndex]);
				}
				// Tab: allow default after adding so focus can move to next field
				if (e.key === "Tab" && suggestions.length === 0) return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				closePopover();
			}
		},
		[
			open,
			suggestions,
			highlightedIndex,
			addBySuggestion,
			closePopover,
		],
	);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="w-48 shrink-0 truncate text-sm font-medium">{label}:</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverAnchor asChild>
					<div
						role="listbox"
						aria-label={label}
						aria-multiselectable
						className={cn(
							"flex flex-1 min-w-[100px] flex-wrap items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 min-h-8 px-2 py-1",
							open && "ring-ring/50 ring-2 ring-offset-2",
						)}
					>
						{recipients.map((r) => (
							<Badge
								key={r.id}
								variant="secondary"
								role="option"
								className="inline-flex items-center gap-0.5 pr-0.5 text-xs shrink-0"
							>
								<span className="max-w-[200px] truncate">
									{r.name ? `${r.name} <${r.email}>` : r.email}
								</span>
								<button
									type="button"
									onClick={() => onRemove(r.id)}
									className="rounded p-0.5 hover:bg-muted-foreground/20"
									aria-label={t("committee.mail.remove")}
								>
									<X className="size-3" />
								</button>
							</Badge>
						))}
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
								blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
							}}
							onKeyDown={onInputKeyDown}
							className={INPUT_CLASS}
							placeholder={recipients.length === 0 ? t("committee.mail.type_to_add") : ""}
						/>
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
						ref={listRef}
						role="listbox"
						aria-label={t("committee.mail.suggestions")}
						className="py-1"
						onMouseDown={(e) => e.preventDefault()}
					>
						{suggestions.length === 0 && query.trim() && (
							<div className="px-2 py-2 text-sm text-muted-foreground">
								{t("committee.mail.no_suggestions")}
							</div>
						)}
						{suggestions.map((item, idx) => {
							const isHighlighted = idx === highlightedIndex;
							let display: string;
							let key: string;
							if (item.type === "role") {
								display = `${t("committee.mail.role")}: ${item.label}`;
								key = `role-${item.roleId}`;
							} else if (item.type === "person") {
								display = `${item.user.name} <${item.user.email}>`;
								key = `person-${item.user.id}`;
							} else {
								display = `${t("committee.mail.add_email")}: ${item.email}`;
								key = `email-${item.email}`;
							}
							return (
								<div
									key={key}
									role="option"
									tabIndex={0}
									aria-selected={isHighlighted}
									className={cn(
										"cursor-pointer px-2 py-2 text-sm",
										isHighlighted && "bg-accent text-accent-foreground",
									)}
									onMouseEnter={() => setHighlightedIndex(idx)}
									onClick={() => addBySuggestion(item)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											addBySuggestion(item);
										}
									}}
								>
									{display}
								</div>
							);
						})}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
