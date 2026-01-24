import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
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

	// Update user profile (language is now managed via the navbar language switcher)
	await db.updateUser(user.id, {
		name: name || user.name,
		apartmentNumber: apartmentNumber || null,
	});

	return data({ success: true });
}

export default function Profile({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { user } = loaderData;
	const { t, i18n } = useTranslation();

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

						{/* Submit Button */}
						<div className="pt-4">
							<Button
								type="submit"
								className="w-full py-6 text-lg font-bold rounded-xl"
							>
								{t("profile.save_changes")}
							</Button>
						</div>
					</Form>
				</div>
			</div>
		</PageWrapper>
	);
}
