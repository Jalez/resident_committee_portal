"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TagPicker } from "~/components/ui/tag-picker";
import { cn } from "~/lib/utils";

export type RoleOption = { id: string; name: string; color?: string };

export interface RolePickerProps {
	selectedRoleIds: string[];
	availableRoles: RoleOption[];
	onChange: (roleIds: string[]) => void;
	disabled?: boolean;
	listId: string;
	label: string;
	/** Optional label width class */
	labelClassName?: string;
}

export function RolePicker({
	selectedRoleIds,
	availableRoles,
	onChange,
	disabled = false,
	listId,
	label,
	labelClassName,
}: RolePickerProps) {
	const { t } = useTranslation();

	const selectedItems = useMemo(
		() =>
			availableRoles.filter((r) => selectedRoleIds.includes(r.id)),
		[availableRoles, selectedRoleIds],
	);

	const getSuggestions = useMemo(
		() => (query: string): RoleOption[] => {
			const lower = query.trim().toLowerCase();
			if (!lower) return availableRoles;
			return availableRoles.filter((r) =>
				r.name.toLowerCase().includes(lower),
			);
		},
		[availableRoles],
	);

	const onSelectSuggestion = useMemo(
		() => (role: RoleOption) => {
			if (selectedRoleIds.includes(role.id)) return;
			onChange([...selectedRoleIds, role.id]);
		},
		[selectedRoleIds, onChange],
	);

	const onRemove = useMemo(
		() => (id: string) => {
			onChange(selectedRoleIds.filter((rid) => rid !== id));
		},
		[selectedRoleIds, onChange],
	);

	return (
		<TagPicker<RoleOption, RoleOption>
			selectedItems={selectedItems}
			onRemove={onRemove}
			getSuggestions={getSuggestions}
			onSelectSuggestion={onSelectSuggestion}
			getItemId={(r) => r.id}
			getSuggestionKey={(r) => r.id}
			renderItem={(r) => r.name}
			getBadgeClassName={(r) =>
				cn(
					"border-transparent text-white",
					r.color ?? "bg-gray-500",
				)
			}
			renderSuggestion={(r) => r.name}
			label={label}
			placeholder={t("settings.users.roles_placeholder")}
			listId={listId}
			disabled={disabled}
			labelClassName={labelClassName}
			emptySuggestionsText={t("settings.users.no_roles_match")}
		/>
	);
}
