import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import type { Role } from "~/db";
import {
	getPermissionsByCategory,
	PERMISSION_CATEGORIES,
	type PermissionName,
} from "~/lib/permissions";

interface PermissionsTableProps {
	selectedRoleData: Role | undefined;
	checkedPermissions: Set<string>;
	onTogglePermission: (permissionId: string, checked: boolean) => void;
	onSelectAllVisible: (ids: string[], checked: boolean) => void;
}

type PermissionRow = {
	id: PermissionName;
	name: PermissionName;
	category: string;
	description: string;
};

export function PermissionsTable({
	selectedRoleData,
	checkedPermissions,
	onTogglePermission,
	onSelectAllVisible,
}: PermissionsTableProps) {
	const { t } = useTranslation();

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [showOnlyChecked, setShowOnlyChecked] = useState(false);
	const fetcher = useFetcher();

	useEffect(() => {
		if (fetcher.data?.success) {
			toast.success("Oikeudet päivitetty / Permissions updated", {
				id: "permissions-update-success",
			});
		} else if (fetcher.data?.error) {
			toast.error(fetcher.data.error, { id: "permissions-update-error" });
		}
	}, [fetcher.data]);

	// Group permissions by category from permissions.ts (source of truth)
	const permissionsByCategory = getPermissionsByCategory();

	// Flatten permissions into array for table display
	const allPermissions: PermissionRow[] = useMemo(() => {
		const flattened: PermissionRow[] = [];
		for (const [category, perms] of Object.entries(permissionsByCategory)) {
			for (const perm of perms) {
				flattened.push({
					id: perm.name,
					name: perm.name,
					category,
					description: t(perm.definition.translationKey),
				});
			}
		}
		return flattened;
	}, [permissionsByCategory, t]);

	// Filter permissions based on search, category, and checked filter
	const filteredPermissions = useMemo(() => {
		let filtered = allPermissions;

		// Apply category filter
		if (selectedCategory !== "all") {
			filtered = filtered.filter((p) => p.category === selectedCategory);
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(p) =>
					p.name.toLowerCase().includes(query) ||
					p.description.toLowerCase().includes(query),
			);
		}

		// Apply "show only checked" filter
		if (showOnlyChecked && selectedRoleData) {
			filtered = filtered.filter((p) => checkedPermissions.has(p.id));
		}

		return filtered;
	}, [
		allPermissions,
		selectedCategory,
		searchQuery,
		showOnlyChecked,
		checkedPermissions,
		selectedRoleData,
	]);

	const handleSelectAllVisible = useCallback(
		(checked: boolean) => {
			const ids = filteredPermissions.map((p) => p.id);
			onSelectAllVisible(ids, checked);
		},
		[filteredPermissions, onSelectAllVisible],
	);

	// Check if there are changes to save
	const hasChanges = useMemo(() => {
		if (!selectedRoleData) return false;
		const originalPermissions = new Set(selectedRoleData.permissions);
		const currentPermissions = checkedPermissions;

		// Check if sets are different
		if (originalPermissions.size !== currentPermissions.size) return true;

		for (const perm of originalPermissions) {
			if (!currentPermissions.has(perm)) return true;
		}

		for (const perm of currentPermissions) {
			if (!originalPermissions.has(perm)) return true;
		}

		return false;
	}, [selectedRoleData, checkedPermissions]);

	if (!selectedRoleData) {
		return (
			<div className="bg-card rounded-2xl shadow-sm border border-border p-12 text-center">
				<p className="text-muted-foreground">
					{t("settings.roles.select_role_msg")}
				</p>
			</div>
		);
	}

	return (
		<div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
			<div className="p-6 space-y-4">
				<h3 className="font-bold">{t("settings.roles.permissions_header")}</h3>

				{/* Filter Controls */}
				<div className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label
								htmlFor="permission-search"
								className="block text-sm font-medium mb-2"
							>
								{t("common.fields.search") || "Search"}
							</label>
							<Input
								id="permission-search"
								type="text"
								placeholder={
									t("settings.roles.search_placeholder") ||
									"Search permissions..."
								}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
						<div>
							<span className="block text-sm font-medium mb-2">
								{t("settings.roles.category") || "Category"}
							</span>
							<Select
								value={selectedCategory}
								onValueChange={setSelectedCategory}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										{t("common.filters.all") || "All Categories"}
									</SelectItem>
									{PERMISSION_CATEGORIES.map((category) => (
										<SelectItem key={category} value={category}>
											{t(`permissions.categories.${category}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="flex items-center space-x-2">
						<Checkbox
							id="show-only-checked"
							checked={showOnlyChecked}
							onCheckedChange={(checked) => setShowOnlyChecked(!!checked)}
						/>
						<label
							htmlFor="show-only-checked"
							className="text-sm font-medium cursor-pointer"
						>
							{t("settings.roles.show_only_assigned") ||
								"Show only assigned permissions"}
						</label>
					</div>
				</div>

				{/* Permissions Table */}
				<div className="border border-border rounded-lg overflow-hidden">
					<div className="overflow-auto max-h-[calc(100vh-500px)]">
						<table className="w-full">
							<TableHeader className="sticky top-0 bg-card z-10">
								<TableRow>
									<TableHead className="w-12">
										<Checkbox
											checked={
												filteredPermissions.length > 0 &&
												filteredPermissions.every((p) =>
													checkedPermissions.has(p.id),
												)
													? true
													: filteredPermissions.some((p) =>
																checkedPermissions.has(p.id),
															)
														? "indeterminate"
														: false
											}
											onCheckedChange={handleSelectAllVisible}
											aria-label="Select all visible"
										/>
									</TableHead>
									<TableHead>
										{t("settings.roles.permission_name") || "Permission Name"}
									</TableHead>
									<TableHead>
										{t("settings.roles.category") || "Category"}
									</TableHead>
									<TableHead>
										{t("settings.roles.description") || "Description"}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredPermissions.length > 0 ? (
									filteredPermissions.map((permission) => (
										<TableRow key={permission.id}>
											<TableCell>
												<Checkbox
													checked={checkedPermissions.has(permission.id)}
													onCheckedChange={(checked) =>
														onTogglePermission(permission.id, !!checked)
													}
													aria-label={`Select ${permission.name}`}
												/>
											</TableCell>
											<TableCell>
												<span className="font-mono text-sm">
													{permission.name}
												</span>
											</TableCell>
											<TableCell>
												<span className="text-sm">
													{t(`permissions.categories.${permission.category}`)}
												</span>
											</TableCell>
											<TableCell>
												<span className="text-sm text-muted-foreground">
													{permission.description}
												</span>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={4}
											className="h-24 text-center text-muted-foreground"
										>
											{t("common.no_results") || "No results"}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</table>
					</div>
				</div>

				{/* Update Button */}
				<div className="flex justify-end pt-4 border-t border-border">
					<fetcher.Form method="post">
						<input type="hidden" name="_action" value="updatePermissions" />
						<input type="hidden" name="roleId" value={selectedRoleData.id} />
						{Array.from(checkedPermissions).map((permId) => (
							<input
								key={permId}
								type="hidden"
								name="permissions"
								value={permId}
							/>
						))}
						<Button
							type="submit"
							disabled={fetcher.state !== "idle" || !hasChanges}
						>
							{fetcher.state === "idle"
								? t("common.actions.update")
								: t("common.status.saving")}
						</Button>
					</fetcher.Form>
				</div>
			</div>
		</div>
	);
}
