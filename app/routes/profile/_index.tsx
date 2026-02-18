import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { data, Form, redirect, useRevalidator } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { FILE_TYPE_CONFIGS } from "~/lib/file-upload-types";
import { hasPermission } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Profiili / Profile` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	if (!authUser) {
		return redirect("/auth/login");
	}

	const db = getDatabase();
	const user = await db.findUserByEmail(authUser.email);

	if (!user) {
		return redirect("/auth/login");
	}

	// Get role name from the user's role
	const roleIds = await db.getUserRoleIds(user.id);
	const roles = await Promise.all(roleIds.map((id) => db.getRoleById(id)));
	const role = roles.find((r) => r !== null) || null;
	const canManageReimbursementDefaults = hasPermission(
		authUser,
		"treasury:reimbursements:write",
	);

	return {
		siteConfig: SITE_CONFIG,
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			apartmentNumber: user.apartmentNumber,
			bankAccount: user.bankAccount || null,
			roleName: role?.name || "Unknown",
			createdAt: user.createdAt,
			localOllamaEnabled: user.localOllamaEnabled,
			localOllamaUrl: user.localOllamaUrl,
			description: user.description || null,
			picture: user.picture || null,
		},
		canManageReimbursementDefaults,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	if (!authUser) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const db = getDatabase();
	const user = await db.findUserByEmail(authUser.email);

	if (!user) {
		throw new Response("User not found", { status: 404 });
	}

	const formData = await request.formData();
	const name = formData.get("name") as string;
	const apartmentNumber = formData.get("apartmentNumber") as string;
	const description = formData.get("description") as string;
	const bankAccount = formData.get("bankAccount") as string;
	const localOllamaEnabled = formData.get("localOllamaEnabled") === "true";
	const localOllamaUrl =
		(formData.get("localOllamaUrl") as string) || "http://localhost:11434";

	const canManageReimbursementDefaults = hasPermission(
		authUser,
		"treasury:reimbursements:write",
	);

	// Update user profile (language is now managed via the navbar language switcher)
	await db.updateUser(user.id, {
		name: name || user.name,
		apartmentNumber: apartmentNumber || null,
		bankAccount: canManageReimbursementDefaults
			? (bankAccount || null)
			: user.bankAccount,
		description: description || null,
		localOllamaEnabled,
		localOllamaUrl,
	});

	return data({ success: true });
}

export default function Profile({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { user, canManageReimbursementDefaults } = loaderData;
	const { t, i18n } = useTranslation();
	const revalidator = useRevalidator();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [localOllamaEnabled, setLocalOllamaEnabled] = useState(
		user.localOllamaEnabled,
	);
	const [localOllamaUrl, setLocalOllamaUrl] = useState(user.localOllamaUrl);
	const [testingConnection, setTestingConnection] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [uploadingPicture, setUploadingPicture] = useState(false);
	const [settingGooglePicture, setSettingGooglePicture] = useState(false);

	useEffect(() => {
		if (actionData?.success) {
			toast.success(t("profile.update_success"));
		}
	}, [actionData, t]);

	const testConnection = async () => {
		setTestingConnection(true);
		setConnectionStatus("idle");
		try {
			const response = await fetch(`${localOllamaUrl}/api/tags`, {
				method: "GET",
				headers: { Accept: "application/json" },
			});
			if (response.ok) {
				const data = await response.json();
				const modelCount = data.models?.length || 0;
				setConnectionStatus("success");
				toast.success(
					t("profile.local_ai.connection_success", { count: modelCount }),
				);
			} else {
				setConnectionStatus("error");
				toast.error(t("profile.local_ai.connection_failed"));
			}
		} catch {
			setConnectionStatus("error");
			toast.error(t("profile.local_ai.connection_error"));
		} finally {
			setTestingConnection(false);
		}
	};

	const uploadPicture = useCallback(
		async (file: File) => {
			const ext = file.name.split(".").pop()?.toLowerCase();
			const allowedExtensions = FILE_TYPE_CONFIGS.avatar.extensions.map(e => e.replace(/^\./, ""));
			
			if (!ext || !allowedExtensions.includes(ext)) {
				toast.error(t("profile.picture_invalid_type"));
				return;
			}

			const maxSizeBytes = (FILE_TYPE_CONFIGS.avatar.maxSizeMB || 5) * 1024 * 1024;
			if (file.size > maxSizeBytes) {
				toast.error(t("profile.picture_too_large", { maxSize: FILE_TYPE_CONFIGS.avatar.maxSizeMB }));
				return;
			}

			const maxDimension = 1024;
			try {
				const dimensions = await new Promise<{ width: number; height: number }>(
					(resolve, reject) => {
						const img = new Image();
						const objectUrl = URL.createObjectURL(file);
						img.onload = () => {
							URL.revokeObjectURL(objectUrl);
							resolve({ width: img.width, height: img.height });
						};
						img.onerror = () => {
							URL.revokeObjectURL(objectUrl);
							reject(new Error("Failed to load image"));
						};
						img.src = objectUrl;
					},
				);

				if (
					dimensions.width > maxDimension ||
					dimensions.height > maxDimension
				) {
					toast.error(
						t("profile.picture_too_large_dimensions", {
							maxDimension: maxDimension,
						}),
					);
					return;
				}
			} catch (error) {
				console.error("Failed to validate image dimensions:", error);
			}

			const pathname = `avatars/${user.id}.${ext}`;
			setUploadingPicture(true);
			try {
				const blob = await upload(pathname, file, {
					access: "public",
					handleUploadUrl: "/api/files/upload-token",
					clientPayload: JSON.stringify({ entityType: "avatar" }),
				});
				const res = await fetch("/api/avatar/set", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url: blob.url }),
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					throw new Error(
						(err as { error?: string }).error || "Set avatar failed",
					);
				}
				toast.success(t("profile.picture_updated"));
				revalidator.revalidate();
			} catch (e) {
				console.error(e);
				toast.error(t("profile.picture_upload_error"));
			} finally {
				setUploadingPicture(false);
				if (fileInputRef.current) fileInputRef.current.value = "";
			}
		},
		[user.id, t, revalidator],
	);

	const onPictureFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			uploadPicture(file);
		},
		[uploadPicture],
	);

	const useGooglePicture = useCallback(async () => {
		setSettingGooglePicture(true);
		try {
			const res = await fetch("/api/avatar/set", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: null }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					(err as { error?: string }).error || "Set avatar failed",
				);
			}
			toast.success(t("profile.use_google_picture_success"));
			revalidator.revalidate();
		} catch (e) {
			console.error(e);
			toast.error(t("profile.picture_upload_error"));
		} finally {
			setSettingGooglePicture(false);
		}
	}, [t, revalidator]);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-foreground">
						{t("profile.title")}
					</h1>
				</div>

				{/* Profile Form */}
				<div className="bg-card text-card-foreground rounded-2xl border border-border p-6 shadow-sm">
					<Form method="post" className="space-y-6">
						{/* Email (read-only) */}
						<div>
							<Label className="mb-2">{t("profile.email_label")}</Label>
							<input
								type="email"
								value={user.email}
								disabled
								className="bg-muted text-muted-foreground w-full cursor-not-allowed rounded-xl px-4 py-3"
							/>
							<p className="text-muted-foreground mt-1 text-xs">
								{t("profile.email_help")}
							</p>
						</div>

						{/* Name */}
						<div>
							<Label htmlFor="name" className="mb-2">
								{t("profile.name_label")}
							</Label>
							<input
								type="text"
								id="name"
								name="name"
								defaultValue={user.name}
								className="bg-background focus-visible:ring-ring/50 w-full rounded-xl border border-border px-4 py-3 transition-all focus-visible:ring-2"
							/>
						</div>

						{/* Apartment Number */}
						<div>
							<Label htmlFor="apartmentNumber" className="mb-2">
								{t("profile.apartment_label")}
								<span className="text-muted-foreground ml-2 text-xs font-normal">
									({t("profile.optional")})
								</span>
							</Label>
							<input
								type="text"
								id="apartmentNumber"
								name="apartmentNumber"
								defaultValue={user.apartmentNumber || ""}
								placeholder={t("profile.apartment_placeholder")}
								className="bg-background focus-visible:ring-ring/50 w-full rounded-xl border border-border px-4 py-3 transition-all focus-visible:ring-2"
							/>
							<p className="text-muted-foreground mt-1 text-xs">
								{t("profile.apartment_help")}
							</p>
						</div>

						{canManageReimbursementDefaults && (
							<div>
								<Label htmlFor="bankAccount" className="mb-2">
									{t("profile.bank_account_label", {
										defaultValue: "Bank account",
									})}
									<span className="text-muted-foreground ml-2 text-xs font-normal">
										({t("profile.optional")})
									</span>
								</Label>
								<input
									type="text"
									id="bankAccount"
									name="bankAccount"
									defaultValue={user.bankAccount || ""}
									placeholder={t("profile.bank_account_placeholder", {
										defaultValue: "FI12 3456 7890 1234 56",
									})}
									className="bg-background focus-visible:ring-ring/50 w-full rounded-xl border border-border px-4 py-3 transition-all focus-visible:ring-2"
								/>
								<p className="text-muted-foreground mt-1 text-xs">
									{t("profile.bank_account_help", {
										defaultValue:
											"Used as default bank account for reimbursement autofill.",
									})}
								</p>
							</div>
						)}

						{/* Role (read-only) */}
						<div>
							<Label className="mb-2">{t("profile.role_label")}</Label>
							<div className="bg-muted rounded-xl px-4 py-3">
								<span className="text-foreground font-medium">
									{user.roleName}
								</span>
							</div>
						</div>

						{/* Member Since */}
						<div>
							<Label className="mb-2">{t("profile.member_since_label")}</Label>
							<div className="bg-muted rounded-xl px-4 py-3">
								<span className="text-foreground">
									{new Date(user.createdAt).toLocaleDateString(i18n.language, {
										day: "numeric",
										month: "long",
										year: "numeric",
									})}
								</span>
							</div>
						</div>

						{/* Description */}
						<div>
							<Label htmlFor="description" className="mb-2">
								{t("profile.description_label")}
								<span className="text-muted-foreground ml-2 text-xs font-normal">
									({t("profile.optional")})
								</span>
							</Label>
							<textarea
								id="description"
								name="description"
								defaultValue={user.description || ""}
								placeholder={t("profile.description_placeholder")}
								rows={4}
								className="bg-background focus-visible:ring-ring/50 w-full resize-none rounded-xl border border-border px-4 py-3 transition-all focus-visible:ring-2"
							/>
							<p className="text-muted-foreground mt-1 text-xs">
								{t("committee.no_description")}
							</p>
						</div>

						{/* Profile Picture */}
						<div>
							<Label className="mb-2">{t("profile.picture_label")}</Label>
							<div className="flex flex-wrap items-start gap-4">
								{user.picture ? (
									<img
										src={user.picture}
										alt={user.name}
										className="border-border h-20 w-20 shrink-0 rounded-full border-2 object-cover"
									/>
								) : (
									<div className="bg-muted flex h-20 w-20 shrink-0 items-center justify-center rounded-full">
										<span className="text-muted-foreground material-symbols-outlined text-4xl">
											person
										</span>
									</div>
								)}
								<div className="flex-1 min-w-0 space-y-2">
									<p className="text-muted-foreground text-sm">
										{t("profile.picture_help")}
									</p>
									<div className="flex flex-wrap gap-2">
										<input
											ref={fileInputRef}
											type="file"
											accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
											onChange={onPictureFileChange}
											className="hidden"
											aria-label={t("profile.upload_picture")}
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={uploadingPicture}
											onClick={() => fileInputRef.current?.click()}
										>
											{uploadingPicture ? (
												<span className="material-symbols-outlined animate-spin text-lg">
													progress_activity
												</span>
											) : (
												<span className="material-symbols-outlined text-lg">
													upload
												</span>
											)}
											<span className="ml-1">
												{uploadingPicture
													? t("common.actions.loading")
													: t("profile.upload_picture")}
											</span>
										</Button>
										{user.picture && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={settingGooglePicture}
												onClick={useGooglePicture}
											>
												{settingGooglePicture ? (
													<span className="material-symbols-outlined animate-spin text-lg">
														progress_activity
													</span>
												) : null}
												<span className="ml-1">
													{t("profile.use_google_picture")}
												</span>
											</Button>
										)}
									</div>
								</div>
							</div>
						</div>

						{/* Local AI Settings Section */}
						<div className="border-border border-t pt-6">
							<h2 className="text-foreground mb-4 text-lg font-bold">
								{t("profile.local_ai.title")}
							</h2>
							<p className="text-muted-foreground mb-4 text-sm">
								{t("profile.local_ai.description")}
							</p>

							{/* Enable Local AI Toggle */}
							<div className="flex items-center justify-between py-3">
								<div className="flex flex-col">
									<Label htmlFor="localOllamaEnabled" className="font-medium">
										{t("profile.local_ai.enable_label")}
									</Label>
									<span className="text-muted-foreground text-xs">
										{t("profile.local_ai.enable_help")}
									</span>
								</div>
								<Switch
									id="localOllamaEnabled"
									checked={localOllamaEnabled}
									onCheckedChange={setLocalOllamaEnabled}
								/>
								<input
									type="hidden"
									name="localOllamaEnabled"
									value={localOllamaEnabled ? "true" : "false"}
								/>
							</div>

							{/* Ollama URL (shown when enabled) */}
							{localOllamaEnabled && (
								<div className="bg-muted/40 mt-4 space-y-4 rounded-xl p-4">
									<div>
										<Label htmlFor="localOllamaUrl" className="mb-2">
											{t("profile.local_ai.url_label")}
										</Label>
										<div className="flex gap-2">
											<input
												type="url"
												id="localOllamaUrl"
												name="localOllamaUrl"
												value={localOllamaUrl}
												onChange={(e) => setLocalOllamaUrl(e.target.value)}
												placeholder="http://localhost:11434"
												className="bg-background focus-visible:ring-ring/50 flex-1 rounded-xl border border-border px-4 py-3 transition-all focus-visible:ring-2"
											/>
											<Button
												type="button"
												variant="outline"
												onClick={testConnection}
												disabled={testingConnection}
												className="shrink-0"
											>
												{testingConnection ? (
													<span className="material-symbols-outlined animate-spin">
														progress_activity
													</span>
												) : connectionStatus === "success" ? (
													<span className="material-symbols-outlined text-green-500">
														check_circle
													</span>
												) : connectionStatus === "error" ? (
													<span className="material-symbols-outlined text-red-500">
														error
													</span>
												) : (
													<span className="material-symbols-outlined">
														wifi_find
													</span>
												)}
												<span className="ml-2">
													{t("profile.local_ai.test_connection")}
												</span>
											</Button>
										</div>
										<p className="text-muted-foreground mt-1 text-xs">
											{t("profile.local_ai.url_help")}
										</p>
									</div>

									{/* CORS Help */}
									<div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
										<div className="flex gap-2">
											<span className="material-symbols-outlined text-amber-600 dark:text-amber-400 shrink-0">
												info
											</span>
											<div className="text-xs text-amber-700 dark:text-amber-300">
												<p className="font-medium mb-1">
													{t("profile.local_ai.cors_title")}
												</p>
												<p>{t("profile.local_ai.cors_help")}</p>
												<code className="block mt-2 p-2 bg-amber-100 dark:bg-amber-900/40 rounded text-[11px] font-mono">
													OLLAMA_ORIGINS=* ollama serve
												</code>
											</div>
										</div>
									</div>
								</div>
							)}
						</div>

						{/* Submit Button */}
						<div className="pt-4">
							<Button
								type="submit"
								className="w-full py-6 text-lg font-bold rounded-xl"
							>
								{t("common.actions.save")}
							</Button>
						</div>
					</Form>
				</div>
			</div>
		</PageWrapper>
	);
}
