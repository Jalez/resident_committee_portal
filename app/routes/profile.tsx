import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { getDatabase } from "~/db";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/profile";

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
	const role = await db.getRoleById(user.roleId);

	return {
		siteConfig: SITE_CONFIG,
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			apartmentNumber: user.apartmentNumber,
			roleName: role?.name || "Unknown",
			createdAt: user.createdAt,
			localOllamaEnabled: user.localOllamaEnabled,
			localOllamaUrl: user.localOllamaUrl,
		},
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
	const localOllamaEnabled = formData.get("localOllamaEnabled") === "true";
	const localOllamaUrl = (formData.get("localOllamaUrl") as string) || "http://localhost:11434";

	// Update user profile (language is now managed via the navbar language switcher)
	await db.updateUser(user.id, {
		name: name || user.name,
		apartmentNumber: apartmentNumber || null,
		localOllamaEnabled,
		localOllamaUrl,
	});

	return data({ success: true });
}

export default function Profile({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { user } = loaderData;
	const { t, i18n } = useTranslation();
	const [localOllamaEnabled, setLocalOllamaEnabled] = useState(user.localOllamaEnabled);
	const [localOllamaUrl, setLocalOllamaUrl] = useState(user.localOllamaUrl);
	const [testingConnection, setTestingConnection] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");

	// Reset connection status when URL changes
	useEffect(() => {
		setConnectionStatus("idle");
	}, [localOllamaUrl]);

	const testConnection = async () => {
		setTestingConnection(true);
		setConnectionStatus("idle");
		try {
			const response = await fetch(`${localOllamaUrl}/api/tags`, {
				method: "GET",
				headers: { "Accept": "application/json" },
			});
			if (response.ok) {
				const data = await response.json();
				const modelCount = data.models?.length || 0;
				setConnectionStatus("success");
				toast.success(t("profile.local_ai.connection_success", { count: modelCount }));
			} else {
				setConnectionStatus("error");
				toast.error(t("profile.local_ai.connection_failed"));
			}
		} catch (error) {
			setConnectionStatus("error");
			toast.error(t("profile.local_ai.connection_error"));
		} finally {
			setTestingConnection(false);
		}
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("profile.title")}
					</h1>
				</div>

				{/* Success Message */}
				{actionData?.success && (
					<div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl">
						<p className="font-medium">{t("profile.update_success")}</p>
					</div>
				)}

				{/* Profile Form */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
					<Form method="post" className="space-y-6">
						{/* Email (read-only) */}
						<div>
							<Label className="mb-2">{t("profile.email_label")}</Label>
							<input
								type="email"
								value={user.email}
								disabled
								className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
							/>
							<p className="mt-1 text-xs text-gray-500">
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
								className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
							/>
						</div>

						{/* Apartment Number */}
						<div>
							<Label htmlFor="apartmentNumber" className="mb-2">
								{t("profile.apartment_label")}
								<span className="ml-2 text-xs font-normal text-gray-500">
									({t("profile.optional")})
								</span>
							</Label>
							<input
								type="text"
								id="apartmentNumber"
								name="apartmentNumber"
								defaultValue={user.apartmentNumber || ""}
								placeholder={t("profile.apartment_placeholder")}
								className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
							/>
							<p className="mt-1 text-xs text-gray-500">
								{t("profile.apartment_help")}
							</p>
						</div>

						{/* Role (read-only) */}
						<div>
							<Label className="mb-2">{t("profile.role_label")}</Label>
							<div className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700">
								<span className="font-medium text-gray-700 dark:text-gray-300">
									{user.roleName}
								</span>
							</div>
						</div>

						{/* Member Since */}
						<div>
							<Label className="mb-2">{t("profile.member_since_label")}</Label>
							<div className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700">
								<span className="text-gray-700 dark:text-gray-300">
									{new Date(user.createdAt).toLocaleDateString(i18n.language, {
										day: "numeric",
										month: "long",
										year: "numeric",
									})}
								</span>
							</div>
						</div>

						{/* Local AI Settings Section */}
						<div className="pt-6 border-t border-gray-200 dark:border-gray-700">
							<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
								{t("profile.local_ai.title")}
							</h2>
							<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
								{t("profile.local_ai.description")}
							</p>

							{/* Enable Local AI Toggle */}
							<div className="flex items-center justify-between py-3">
								<div className="flex flex-col">
									<Label htmlFor="localOllamaEnabled" className="font-medium">
										{t("profile.local_ai.enable_label")}
									</Label>
									<span className="text-xs text-gray-500 dark:text-gray-400">
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
								<div className="space-y-4 mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
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
												className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
											/>
											<Button
												type="button"
												variant="outline"
												onClick={testConnection}
												disabled={testingConnection}
												className="shrink-0"
											>
												{testingConnection ? (
													<span className="material-symbols-outlined animate-spin">progress_activity</span>
												) : connectionStatus === "success" ? (
													<span className="material-symbols-outlined text-green-500">check_circle</span>
												) : connectionStatus === "error" ? (
													<span className="material-symbols-outlined text-red-500">error</span>
												) : (
													<span className="material-symbols-outlined">wifi_find</span>
												)}
												<span className="ml-2">{t("profile.local_ai.test_connection")}</span>
											</Button>
										</div>
										<p className="mt-1 text-xs text-gray-500">
											{t("profile.local_ai.url_help")}
										</p>
									</div>

									{/* CORS Help */}
									<div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
										<div className="flex gap-2">
											<span className="material-symbols-outlined text-amber-600 dark:text-amber-400 shrink-0">info</span>
											<div className="text-xs text-amber-700 dark:text-amber-300">
												<p className="font-medium mb-1">{t("profile.local_ai.cors_title")}</p>
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
