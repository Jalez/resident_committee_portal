"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TagPicker } from "~/components/ui/tag-picker";

export type RecipientEntry = { id: string; email: string; name?: string };

type RoleOption = { id: string; name: string };
type PersonOption = { id: string; name: string; email: string };

type SuggestionItem =
	| { type: "role"; roleId: string; label: string }
	| { type: "person"; user: PersonOption }
	| { type: "email"; email: string };

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

	const getSuggestions = useMemo(
		() => (query: string): SuggestionItem[] => {
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
		},
		[roles, recipientCandidates],
	);

	const onSelectSuggestion = useMemo(
		() => (item: SuggestionItem) => {
			if (item.type === "role") {
				onGetRecipientsForRole(item.roleId);
			} else if (item.type === "person") {
				onAdd([{ email: item.user.email, name: item.user.name }]);
			} else {
				onAdd([{ email: item.email }]);
			}
		},
		[onAdd, onGetRecipientsForRole],
	);

	return (
		<TagPicker<RecipientEntry, SuggestionItem>
			selectedItems={recipients}
			onRemove={onRemove}
			getSuggestions={getSuggestions}
			onSelectSuggestion={onSelectSuggestion}
			getItemId={(r) => r.id}
			getSuggestionKey={(item) => {
				if (item.type === "role") return `role-${item.roleId}`;
				if (item.type === "person") return `person-${item.user.id}`;
				return `email-${item.email}`;
			}}
			renderItem={(r) => (r.name ? `${r.name} <${r.email}>` : r.email)}
			renderSuggestion={(item) => {
				if (item.type === "role") {
					return `${t("committee.mail.role")}: ${item.label}`;
				}
				if (item.type === "person") {
					return `${item.user.name} <${item.user.email}>`;
				}
				return `${t("committee.mail.add_email")}: ${item.email}`;
			}}
			label={label}
			placeholder={t("committee.mail.type_to_add")}
			listId={listId}
			emptySuggestionsText={t("committee.mail.no_suggestions")}
		/>
	);
}
