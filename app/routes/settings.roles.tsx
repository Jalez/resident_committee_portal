import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useNavigation } from "react-router";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
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
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import {
	getPermissionsByCategory,
	PERMISSION_CATEGORIES,
	type PermissionName,
} from "~/lib/permissions";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/settings.roles";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Roolihallinta / Roles` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	// Throw 404 for unauthorized access to hide admin routes
	try {
		await requirePermission(request, "settings:roles", getDatabase);
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const roles = await db.getAllRoles();

	// Add permission count from role.permissions array
	const rolesWithPermissions = roles.map((role) => ({
		...role,
		permissionCount: role.permissions.length,
	}));

	// Group permissions by category from permissions.ts (source of truth)
	const permissionsByCategory = getPermissionsByCategory();

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		roles: rolesWithPermissions,
		permissionsByCategory,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	// Check permission based on action type
	try {
		if (actionType === "delete") {
			await requirePermission(request, "roles:delete", getDatabase);
		} else {
			await requirePermission(request, "roles:write", getDatabase);
		}
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

	if (actionType === "create") {
		const name = formData.get("name") as string;
		const description = formData.get("description") as string;
		const color = (formData.get("color") as string) || "bg-gray-500";

		if (name) {
			await db.createRole({
				name,
				description,
				color,
				isSystem: false,
				sortOrder: 99,
				permissions: [],
			});
		}
	}

	if (actionType === "update") {
		const roleId = formData.get("roleId") as string;
		const name = formData.get("name") as string;
		const description = formData.get("description") as string;
		const color = formData.get("color") as string;

		if (roleId) {
			await db.updateRole(roleId, { name, description, color });
		}
	}

	if (actionType === "delete") {
		const roleId = formData.get("roleId") as string;
		if (roleId) {
			try {
				await db.deleteRole(roleId);
			} catch (_error) {
				return { error: "Cannot delete system role" };
			}
		}
	}

	if (actionType === "updatePermissions") {
		const roleId = formData.get("roleId") as string;
		const permissions = formData.getAll("permissions") as string[];

		if (roleId) {
			// Update role.permissions array directly
			await db.updateRole(roleId, { permissions });
		}
	}

	return { success: true, action: actionType };
}

const ROLE_COLORS = [
	{ value: "bg-gray-500", label: "Gray", class: "bg-gray-500" },
	{ value: "bg-slate-500", label: "Slate", class: "bg-slate-500" },
	{ value: "bg-blue-500", label: "Blue", class: "bg-blue-500" },
	{ value: "bg-purple-500", label: "Purple", class: "bg-purple-500" },
	{ value: "bg-green-500", label: "Green", class: "bg-green-500" },
	{ value: "bg-yellow-500", label: "Yellow", class: "bg-yellow-500" },
	{ value: "bg-orange-500", label: "Orange", class: "bg-orange-500" },
	{ value: "bg-red-500", label: "Red", class: "bg-red-500" },
	{ value: "bg-pink-500", label: "Pink", class: "bg-pink-500" },
	{ value: "bg-teal-500", label: "Teal", class: "bg-teal-500" },
];

type PermissionRow = {
	id: PermissionName;
	name: PermissionName;
	category: string;
	description: string;
};

export default function AdminRoles({ loaderData }: Route.ComponentProps) {
	const { roles, permissionsByCategory, systemLanguages } = loaderData;
	const { t } = useTranslation();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const [showNewRoleForm, setShowNewRoleForm] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [showOnlyChecked, setShowOnlyChecked] = useState(false);
	const [checkedPermissions, setCheckedPermissions] = useState<Set<string>>(
		new Set(),
	);
	const actionData = useActionData<{
		success?: boolean;
		action?: string;
		error?: string;
	}>();

	// Show toast notifications on action completion
	useEffect(() => {
		if (actionData?.success) {
			if (actionData.action === "create") {
				toast.success("Rooli luotu / Role created");
				setShowNewRoleForm(false);
			} else if (actionData.action === "updatePermissions") {
				toast.success("Oikeudet päivitetty / Permissions updated");
				// Reset checked permissions to match updated role
				if (selectedRole) {
					const updatedRole = roles.find((r) => r.id === selectedRole);
					if (updatedRole) {
						setCheckedPermissions(new Set(updatedRole.permissions));
					}
				}
			} else if (actionData.action === "delete") {
				toast.success("Rooli poistettu / Role deleted");
				setSelectedRole(null);
			} else if (actionData.action === "update") {
				toast.success("Rooli päivitetty / Role updated");
			}
		} else if (actionData?.error) {
			toast.error(actionData.error);
		}
	}, [actionData, selectedRole, roles]);

	const selectedRoleData = roles.find((r) => r.id === selectedRole);

	// Initialize checked permissions when role changes
	useEffect(() => {
		if (selectedRoleData) {
			setCheckedPermissions(new Set(selectedRoleData.permissions));
		} else {
			setCheckedPermissions(new Set());
		}
	}, [selectedRoleData]);

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
	}, [allPermissions, selectedCategory, searchQuery, showOnlyChecked, checkedPermissions, selectedRoleData]);

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

	// Handle role selection change
	const handleRoleChange = (roleId: string) => {
		setSelectedRole(roleId);
	};

	// Handle checkbox change
	const handlePermissionToggle = useCallback(
		(permissionId: string, checked: boolean) => {
			setCheckedPermissions((prev) => {
				const newSet = new Set(prev);
				if (checked) {
					newSet.add(permissionId);
				} else {
					newSet.delete(permissionId);
				}
				return newSet;
			});
		},
		[],
	);

	// Handle select all visible
	const handleSelectAllVisible = useCallback(
		(checked: boolean) => {
			setCheckedPermissions((prev) => {
				const newSet = new Set(prev);
				if (checked) {
					for (const perm of filteredPermissions) {
						newSet.add(perm.id);
					}
				} else {
					for (const perm of filteredPermissions) {
						newSet.delete(perm.id);
					}
				}
				return newSet;
			});
		},
		[filteredPermissions],
	);


	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("settings.roles.title", { lng: systemLanguages.primary }),
					secondary: t("settings.roles.title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
			>
				{/* New Role Form */}
				{showNewRoleForm && (
					<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
						<h2 className="text-xl font-bold mb-4">
							{t("settings.roles.create_new_title")}
						</h2>
						<Form method="post" className="space-y-4">
							<input type="hidden" name="_action" value="create" />

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="role-name"
										className="block text-sm font-medium mb-1"
									>
										{t("common.fields.name")} *
									</label>
									<input
										id="role-name"
										type="text"
										name="name"
										required
										className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
										placeholder="e.g., Treasurer"
									/>
								</div>
								<div>
									<label
										htmlFor="role-color"
										className="block text-sm font-medium mb-1"
									>
										{t("settings.roles.color_label")}
									</label>
									<select
										id="role-color"
										name="color"
										className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
									>
										{ROLE_COLORS.map((color) => (
											<option key={color.value} value={color.value}>
												{color.label}
											</option>
										))}
									</select>
								</div>
							</div>

							<div>
								<label
									htmlFor="role-desc"
									className="block text-sm font-medium mb-1"
								>
									{t("common.fields.description")}
								</label>
								<input
									id="role-desc"
									type="text"
									name="description"
									className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
									placeholder="Optional description"
								/>
							</div>

							<div className="flex gap-2 justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => setShowNewRoleForm(false)}
								>
									{t("common.actions.cancel")}
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting
										? t("common.status.saving")
										: t("common.actions.create")}
								</Button>
							</div>
						</Form>
					</div>
				)}

				<div className="space-y-6">
					{/* Role Selector and Actions */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
						<div className="flex items-center justify-between gap-4 flex-wrap">
							<div className="flex-1 min-w-[200px]">
								<div className="block text-sm font-medium mb-2">
									{t("settings.roles.select_role") || "Select Role"}
								</div>
								<Select
									value={selectedRole ?? undefined}
									onValueChange={handleRoleChange}
								>
									<SelectTrigger className="w-full">
										<SelectValue
											placeholder={
												t("settings.roles.select_role_placeholder") ||
												"Choose a role..."
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{roles.map((role) => (
											<SelectItem key={role.id} value={role.id}>
												<div className="flex items-center gap-2">
													<div
														className={cn("w-3 h-3 rounded-full", role.color)}
													/>
													<span>{role.name}</span>
													{role.isSystem && (
														<span className="text-xs text-gray-500">
															({t("settings.roles.system")})
														</span>
													)}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									onClick={() => setShowNewRoleForm(true)}
									className="bg-blue-600 hover:bg-blue-700"
								>
									<span className="material-symbols-outlined text-sm mr-1">
										add
									</span>
									{t("common.actions.add")}
								</Button>
								{selectedRoleData && !selectedRoleData.isSystem && (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button variant="destructive" size="sm">
												{t("common.actions.delete")}
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													{t("settings.roles.delete_title")}
												</AlertDialogTitle>
												<AlertDialogDescription>
													{t("settings.roles.delete_confirm", {
														name: selectedRoleData.name,
													})}
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>
													{t("common.actions.cancel")}
												</AlertDialogCancel>
												<Form method="post">
													<input
														type="hidden"
														name="_action"
														value="delete"
													/>
													<input
														type="hidden"
														name="roleId"
														value={selectedRoleData.id}
													/>
													<AlertDialogAction
														type="submit"
														className="bg-red-600 hover:bg-red-700 font-bold text-white border-0"
													>
														{t("common.actions.delete")}
													</AlertDialogAction>
												</Form>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								)}
							</div>
						</div>
					</div>

					{/* Permissions Table */}
					{selectedRoleData ? (
						<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
							<div className="p-6 space-y-4">
								<h3 className="font-bold">
									{t("settings.roles.permissions_header")}
								</h3>

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
											onCheckedChange={(checked) =>
												setShowOnlyChecked(!!checked)
											}
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
								<div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
									<div className="overflow-auto max-h-[calc(100vh-500px)]">
										<table className="w-full">
											<TableHeader className="sticky top-0 bg-white dark:bg-gray-800 z-10">
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
														{t("settings.roles.permission_name") ||
															"Permission Name"}
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
																		handlePermissionToggle(
																			permission.id,
																			!!checked,
																		)
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
																<span className="text-sm text-gray-600 dark:text-gray-400">
																	{permission.description}
																</span>
															</TableCell>
														</TableRow>
													))
												) : (
													<TableRow>
														<TableCell
															colSpan={4}
															className="h-24 text-center text-gray-500"
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
								<div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
									<Form method="post">
										<input
											type="hidden"
											name="_action"
											value="updatePermissions"
										/>
										<input
											type="hidden"
											name="roleId"
											value={selectedRoleData.id}
										/>
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
											disabled={isSubmitting || !hasChanges}
										>
											{isSubmitting
												? t("common.status.saving")
												: t("common.actions.update")}
										</Button>
									</Form>
								</div>
							</div>
						</div>
					) : (
						<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
							<p className="text-gray-500">
								{t("settings.roles.select_role_msg")}
							</p>
						</div>
					)}
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
