import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getDatabase, type NewSocialLink } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/social.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi some-kanava / New Social Channel`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "social:write", getDatabase);
	return { siteConfig: SITE_CONFIG };
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "social:write", getDatabase);
	const db = getDatabase();

	const formData = await request.formData();

	const newLink: NewSocialLink = {
		name: formData.get("name") as string,
		icon: formData.get("icon") as string,
		url: formData.get("url") as string,
		color: (formData.get("color") as string) || "bg-blue-500",
		sortOrder: parseInt(formData.get("sortOrder") as string, 10) || 0,
		isActive: formData.get("isActive") === "on",
	};

	await db.createSocialLink(newLink);

	return redirect("/social");
}

// Common Material icons for social media
const COMMON_ICONS = [
	{ icon: "send", labelKey: "telegram" },
	{ icon: "photo_camera", labelKey: "instagram" },
	{ icon: "thumb_up", labelKey: "facebook" },
	{ icon: "public", labelKey: "website" },
	{ icon: "mail", labelKey: "email" },
	{ icon: "chat", labelKey: "discord" },
	{ icon: "videocam", labelKey: "youtube" },
	{ icon: "link", labelKey: "link" },
];

// Common color presets
const COLOR_PRESETS = [
	{ value: "bg-blue-500", labelKey: "blue" },
	{ value: "bg-blue-700", labelKey: "dark_blue" },
	{ value: "bg-pink-600", labelKey: "pink" },
	{ value: "bg-purple-600", labelKey: "purple" },
	{ value: "bg-red-600", labelKey: "red" },
	{ value: "bg-green-600", labelKey: "green" },
	{ value: "bg-orange-500", labelKey: "orange" },
	{ value: "bg-gray-700", labelKey: "gray" },
];

export default function SocialNew() {
	const navigate = useNavigate();
	const { t } = useTranslation();

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center gap-4 mb-8">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate("/social")}
						className="h-10 w-10"
					>
						<span className="material-symbols-outlined">arrow_back</span>
					</Button>
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("social.new.header")}
						</h1>
					</div>
				</div>

				{/* Form */}
				<Form method="post" className="space-y-6">
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						{/* Name */}
						<div className="space-y-2">
							<Label htmlFor="name">{t("social.form.name")} *</Label>
							<Input id="name" name="name" required placeholder="Telegram" />
						</div>

						{/* URL */}
						<div className="space-y-2">
							<Label htmlFor="url">{t("social.form.url")} *</Label>
							<Input
								id="url"
								name="url"
								type="url"
								required
								placeholder="https://t.me/yourgroup"
							/>
						</div>

						{/* Icon */}
						<div className="space-y-2">
							<Label htmlFor="icon">{t("social.form.icon")} *</Label>
							<Input id="icon" name="icon" required placeholder="send" />
							<div className="flex flex-wrap gap-2 mt-2">
								{COMMON_ICONS.map(({ icon, labelKey }) => (
									<Button
										key={icon}
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => {
											const input = document.getElementById(
												"icon",
											) as HTMLInputElement;
											if (input) input.value = icon;
										}}
										className="flex items-center gap-1 h-auto py-1 px-2 mb-1"
										title={t(`social.icons.${labelKey}`)}
									>
										<span className="material-symbols-outlined text-lg">
											{icon}
										</span>
										<span className="text-xs text-gray-500">
											{t(`social.icons.${labelKey}`)}
										</span>
									</Button>
								))}
							</div>
						</div>

						{/* Color */}
						<div className="space-y-2">
							<Label htmlFor="color">{t("social.form.color")}</Label>
							<select
								id="color"
								name="color"
								defaultValue="bg-blue-500"
								className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
							>
								{COLOR_PRESETS.map(({ value, labelKey }) => (
									<option key={value} value={value}>
										{t(`social.colors.${labelKey}`)}
									</option>
								))}
							</select>
						</div>

						{/* Sort Order */}
						<div className="space-y-2">
							<Label htmlFor="sortOrder">{t("social.form.sort_order")}</Label>
							<Input
								id="sortOrder"
								name="sortOrder"
								type="number"
								defaultValue="0"
								placeholder="0"
							/>
							<p className="text-xs text-gray-500">
								{t("social.new.sort_desc")}
							</p>
						</div>

						{/* Active */}
						<div className="flex items-center gap-3">
							<Checkbox id="isActive" name="isActive" defaultChecked />
							<Label htmlFor="isActive">
								{t("social.form.active")}
								<span className="text-xs text-gray-500 block">
									{t("social.new.hidden_desc")}
								</span>
							</Label>
						</div>
					</div>

					{/* Actions */}
					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate("/social")}
						>
							{t("settings.common.cancel")}
						</Button>
						<Button type="submit">
							<span className="material-symbols-outlined mr-2">add</span>
							{t("social.add_link")}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
