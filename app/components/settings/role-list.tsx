import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
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
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { Role } from "~/db";
import { cn } from "~/lib/utils";

interface RoleListProps {
	roles: (Role & { permissionCount: number })[];
	selectedRole: string | null;
	onRoleSelect: (roleId: string) => void;
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

export function RoleList({ roles, selectedRole, onRoleSelect }: RoleListProps) {
	const { t } = useTranslation();
	const [showNewRoleForm, setShowNewRoleForm] = useState(false);
	const createFetcher = useFetcher();
	const deleteFetcher = useFetcher();

	useEffect(() => {
		if (createFetcher.data?.success) {
			toast.success("Rooli luotu / Role created", {
				id: "role-create-success",
			});
			setShowNewRoleForm(false);
		} else if (createFetcher.data?.error) {
			toast.error(createFetcher.data.error, { id: "role-create-error" });
		}
	}, [createFetcher.data]);

	useEffect(() => {
		if (deleteFetcher.data?.success) {
			toast.success("Rooli poistettu / Role deleted", {
				id: "role-delete-success",
			});
			onRoleSelect(""); // Clear selection
		} else if (deleteFetcher.data?.error) {
			toast.error(deleteFetcher.data.error, { id: "role-delete-error" });
		}
	}, [deleteFetcher.data, onRoleSelect]);

	const selectedRoleData = roles.find((r) => r.id === selectedRole);

	return (
		<>
			{/* New Role Form */}
			{showNewRoleForm && (
				<div className="bg-card rounded-2xl shadow-sm border border-border p-6 mb-8">
					<h2 className="text-xl font-bold mb-4">
						{t("settings.roles.create_new_title")}
					</h2>
					<createFetcher.Form method="post" className="space-y-4">
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
									className="w-full px-3 py-2 border rounded-lg bg-background border-input"
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
									className="w-full px-3 py-2 border rounded-lg bg-background border-input"
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
								className="w-full px-3 py-2 border rounded-lg bg-background border-input"
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
							<Button type="submit" disabled={createFetcher.state !== "idle"}>
								{createFetcher.state === "idle"
									? t("common.actions.create")
									: t("common.status.saving")}
							</Button>
						</div>
					</createFetcher.Form>
				</div>
			)}

			<div className="bg-card rounded-2xl shadow-sm border border-border p-6">
				<div className="flex items-center justify-between gap-4 flex-wrap">
					<div className="flex-1 min-w-[200px]">
						<div className="block text-sm font-medium mb-2">
							{t("settings.roles.select_role") || "Select Role"}
						</div>
						<Select
							value={selectedRole ?? undefined}
							onValueChange={onRoleSelect}
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
											<div className={cn("w-3 h-3 rounded-full", role.color)} />
											<span>{role.name}</span>
											{role.isSystem && (
												<span className="text-xs text-muted-foreground">
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
										<deleteFetcher.Form method="post">
											<input type="hidden" name="_action" value="delete" />
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
										</deleteFetcher.Form>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
