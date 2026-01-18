import type { Route } from "./+types/settings.roles";
import { Form, useNavigation, Link, useActionData } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase, type Role, type Permission } from "~/db";
import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";
import { SITE_CONFIG } from "~/lib/config.server";
import { Button } from "~/components/ui/button";
import { useState, useEffect } from "react";
import { PERMISSIONS, getPermissionsByCategory, type PermissionName } from "~/lib/permissions";
import { toast } from "sonner";
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
	} catch (error) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();

	const [roles, permissions] = await Promise.all([
		db.getAllRoles(),
		db.getAllPermissions(),
	]);

	// Get permission counts for each role
	const rolesWithPermissions = await Promise.all(
		roles.map(async (role) => {
			const rolePerms = await db.getRolePermissions(role.id);
			return {
				...role,
				permissionCount: rolePerms.length,
				permissionIds: rolePerms.map(p => p.id),
			};
		})
	);

	// Group permissions by category
	const permissionsByCategory = permissions.reduce((acc, perm) => {
		if (!acc[perm.category]) {
			acc[perm.category] = [];
		}
		acc[perm.category].push(perm);
		return acc;
	}, {} as Record<string, Permission[]>);

	return {
		siteConfig: SITE_CONFIG,
		roles: rolesWithPermissions,
		permissions,
		permissionsByCategory,
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
	} catch (error) {
		throw new Response("Not Found", { status: 404 });
	}

	if (actionType === "create") {
		const name = formData.get("name") as string;
		const description = formData.get("description") as string;
		const color = formData.get("color") as string || "bg-gray-500";

		if (name) {
			await db.createRole({
				name,
				description,
				color,
				isSystem: false,
				sortOrder: 99,
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
			} catch (error) {
				return { error: "Cannot delete system role" };
			}
		}
	}

	if (actionType === "updatePermissions") {
		const roleId = formData.get("roleId") as string;
		const permissionIds = formData.getAll("permissions") as string[];

		if (roleId) {
			await db.setRolePermissions(roleId, permissionIds);
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

export default function AdminRoles({ loaderData }: Route.ComponentProps) {
	const { roles, permissionsByCategory } = loaderData;
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const [showNewRoleForm, setShowNewRoleForm] = useState(false);
	const actionData = useActionData<{ success?: boolean; action?: string; error?: string }>();

	// Show toast notifications on action completion
	useEffect(() => {
		if (actionData?.success) {
			if (actionData.action === "create") {
				toast.success("Rooli luotu / Role created");
				setShowNewRoleForm(false);
			} else if (actionData.action === "updatePermissions") {
				toast.success("Oikeudet päivitetty / Permissions updated");
			} else if (actionData.action === "delete") {
				toast.success("Rooli poistettu / Role deleted");
				setSelectedRole(null);
			} else if (actionData.action === "update") {
				toast.success("Rooli päivitetty / Role updated");
			}
		} else if (actionData?.error) {
			toast.error(actionData.error);
		}
	}, [actionData]);

	const selectedRoleData = roles.find(r => r.id === selectedRole);

	return (
		<PageWrapper>
			<div className="w-full max-w-6xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							Roolihallinta
						</h1>
						<p className="text-lg text-gray-500">Role Management</p>
					</div>
				</div>

				{/* New Role Form */}
				{showNewRoleForm && (
					<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
						<h2 className="text-xl font-bold mb-4">Luo uusi rooli / Create New Role</h2>
						<Form method="post" className="space-y-4">
							<input type="hidden" name="_action" value="create" />

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium mb-1">
										Nimi / Name *
									</label>
									<input
										type="text"
										name="name"
										required
										className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
										placeholder="e.g., Treasurer"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium mb-1">
										Väri / Color
									</label>
									<select
										name="color"
										className="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700"
									>
										{ROLE_COLORS.map(color => (
											<option key={color.value} value={color.value}>
												{color.label}
											</option>
										))}
									</select>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium mb-1">
									Kuvaus / Description
								</label>
								<input
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
									Peruuta / Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Luodaan..." : "Luo / Create"}
								</Button>
							</div>
						</Form>
					</div>
				)}

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Roles List */}
					<div className="lg:col-span-1">
						<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
							<div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
								<h2 className="font-bold">Roolit / Roles ({roles.length})</h2>
								<Button
									size="sm"
									onClick={() => setShowNewRoleForm(true)}
									className="bg-blue-600 hover:bg-blue-700"
								>
									<span className="material-symbols-outlined text-sm mr-1">add</span>
									Uusi / New
								</Button>
							</div>
							<div className="divide-y divide-gray-100 dark:divide-gray-700">
								{roles.map(role => (
									<button
										key={role.id}
										type="button"
										onClick={() => setSelectedRole(role.id)}
										className={cn(
											"w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors",
											selectedRole === role.id && "bg-blue-50 dark:bg-blue-900/20"
										)}
									>
										<div className="flex items-center gap-3">
											<div className={cn("w-3 h-3 rounded-full", role.color)} />
											<div className="flex-1">
												<p className="font-medium text-gray-900 dark:text-white">
													{role.name}
													{role.isSystem && (
														<span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
															System
														</span>
													)}
												</p>
												<p className="text-sm text-gray-500">
													{role.permissionCount} permissions
												</p>
											</div>
										</div>
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Role Details & Permissions */}
					<div className="lg:col-span-2">
						{selectedRoleData ? (
							<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
								{/* Role Header */}
								<div className="p-6 border-b border-gray-200 dark:border-gray-700">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<div className={cn("w-4 h-4 rounded-full", selectedRoleData.color)} />
											<div>
												<h2 className="text-xl font-bold">{selectedRoleData.name}</h2>
												<p className="text-sm text-gray-500">{selectedRoleData.description}</p>
											</div>
										</div>
										{!selectedRoleData.isSystem && (
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button variant="destructive" size="sm">
														Poista / Delete
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>Poista rooli / Delete Role</AlertDialogTitle>
														<AlertDialogDescription>
															Oletko varma että haluat poistaa roolin "{selectedRoleData.name}"? Tätä toimintoa ei voi peruuttaa.
															<br /><br />
															Are you sure you want to delete the role "{selectedRoleData.name}"? This action cannot be undone.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Peruuta / Cancel</AlertDialogCancel>
														<Form method="post">
															<input type="hidden" name="_action" value="delete" />
															<input type="hidden" name="roleId" value={selectedRoleData.id} />
															<AlertDialogAction type="submit" className="bg-red-600 hover:bg-red-700 font-bold text-white border-0">
																Poista / Delete
															</AlertDialogAction>
														</Form>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										)}
									</div>
								</div>

								{/* Permissions Form */}
								<Form method="post" className="p-6" key={selectedRoleData.id}>
									<input type="hidden" name="_action" value="updatePermissions" />
									<input type="hidden" name="roleId" value={selectedRoleData.id} />

									<h3 className="font-bold mb-4">Oikeudet / Permissions</h3>

									<div className="space-y-6">
										{Object.entries(permissionsByCategory).map(([category, perms]) => (
											<div key={category}>
												<h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
													{category}
												</h4>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
													{perms.map(perm => {
														const permDef = PERMISSIONS[perm.name as PermissionName];
														return (
															<label
																key={perm.id}
																className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
															>
																<input
																	type="checkbox"
																	name="permissions"
																	value={perm.id}
																	defaultChecked={selectedRoleData.permissionIds.includes(perm.id)}
																	className="mt-1"
																/>
																<div>
																	<p className="font-mono text-sm text-gray-900 dark:text-white">
																		{perm.name}
																	</p>
																	<p className="text-xs text-gray-500">
																		{permDef?.descriptionFi || perm.description}
																	</p>
																	<p className="text-xs text-gray-400">
																		{permDef?.description || ""}
																	</p>
																</div>
															</label>
														);
													})}
												</div>
											</div>
										))}
									</div>

									<div className="mt-6 flex justify-end">
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting ? "Tallennetaan..." : "Tallenna / Save"}
										</Button>
									</div>
								</Form>
							</div>
						) : (
							<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
								<p className="text-gray-500">
									Valitse rooli vasemmalta muokataksesi oikeuksia
								</p>
								<p className="text-gray-400 text-sm">
									Select a role from the left to edit permissions
								</p>
							</div>
						)}
					</div>
				</div>


			</div>
		</PageWrapper>
	);
}
