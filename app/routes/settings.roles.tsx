import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useNavigation } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
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
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getPermissionsByCategory } from "~/lib/permissions";
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

	return {
		siteConfig: SITE_CONFIG,
		roles: rolesWithPermissions,
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

export default function AdminRoles({ loaderData }: Route.ComponentProps) {
	const { roles, permissionsByCategory } = loaderData;
	const { t } = useTranslation();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const [showNewRoleForm, setShowNewRoleForm] = useState(false);
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

	const selectedRoleData = roles.find((r) => r.id === selectedRole);

	return (
		<PageWrapper>
			<div className="w-full max-w-6xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("settings.roles.title")}
						</h1>
					</div>
				</div>

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
										{t("settings.roles.name_label")} *
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
									{t("settings.roles.desc_label")}
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
									{t("settings.common.cancel")}
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting
										? t("settings.common.saving")
										: t("settings.common.create")}
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
								<h2 className="font-bold">
									{t("settings.roles.list_title", { count: roles.length })}
								</h2>
								<Button
									size="sm"
									onClick={() => setShowNewRoleForm(true)}
									className="bg-blue-600 hover:bg-blue-700"
								>
									<span className="material-symbols-outlined text-sm mr-1">
										add
									</span>
									{t("settings.common.new")}
								</Button>
							</div>
							<div className="divide-y divide-gray-100 dark:divide-gray-700">
								{roles.map((role) => (
									<Button
										key={role.id}
										type="button"
										variant="ghost"
										onClick={() => setSelectedRole(role.id)}
										className={cn(
											"w-full h-auto p-4 justify-start text-left font-normal rounded-none border-b border-gray-100 last:border-b-0 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50",
											selectedRole === role.id &&
												"bg-blue-50 dark:bg-blue-900/20",
										)}
									>
										<div className="flex items-center gap-3">
											<div className={cn("w-3 h-3 rounded-full", role.color)} />
											<div className="flex-1">
												<p className="font-medium text-gray-900 dark:text-white">
													{role.name}
													{role.isSystem && (
														<span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
															{t("settings.roles.system")}
														</span>
													)}
												</p>
												<p className="text-sm text-gray-500">
													{t("settings.roles.permissions_count", {
														count: role.permissionCount,
													})}
												</p>
											</div>
										</div>
									</Button>
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
											<div
												className={cn(
													"w-4 h-4 rounded-full",
													selectedRoleData.color,
												)}
											/>
											<div>
												<h2 className="text-xl font-bold">
													{selectedRoleData.name}
												</h2>
												<p className="text-sm text-gray-500">
													{selectedRoleData.description}
												</p>
											</div>
										</div>
										{!selectedRoleData.isSystem && (
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button variant="destructive" size="sm">
														{t("settings.common.delete")}
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
															{t("settings.common.cancel")}
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
																{t("settings.common.delete")}
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

									<h3 className="font-bold mb-4">
										{t("settings.roles.permissions_header")}
									</h3>

									<div className="space-y-6">
										{Object.entries(permissionsByCategory).map(
											([category, perms]) => (
												<div key={category}>
													<h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
														{category}
													</h4>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
														{perms.map((perm) => (
															<label
																key={perm.name}
																className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
															>
																<input
																	type="checkbox"
																	name="permissions"
																	value={perm.name}
																	defaultChecked={selectedRoleData.permissions.includes(
																		perm.name,
																	)}
																	className="mt-1"
																/>
																<div>
																	<p className="font-mono text-sm text-gray-900 dark:text-white">
																		{perm.name}
																	</p>
																	<p className="text-xs text-gray-500">
																		{perm.definition.descriptionFi}
																	</p>
																	<p className="text-xs text-gray-400">
																		{perm.definition.description}
																	</p>
																</div>
															</label>
														))}
													</div>
												</div>
											),
										)}
									</div>

									<div className="mt-6 flex justify-end">
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting
												? t("settings.common.saving")
												: t("settings.common.save")}
										</Button>
									</div>
								</Form>
							</div>
						) : (
							<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
								<p className="text-gray-500">
									{t("settings.roles.select_role_msg")}
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</PageWrapper>
	);
}
