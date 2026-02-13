import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm } from "~/components/ui/edit-form";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { getLanguageNames } from "~/lib/language-names.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.news?.title ?? "News"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "news",
		permission: "news:update",
		params,
		request,
		fetchEntity: (db, id) => db.getNewsById(id),
		extend: async () => {
			const [systemLanguages, languageNames] = await Promise.all([
				getSystemLanguageDefaults(),
				getLanguageNames(),
			]);
			const primaryLabel =
				languageNames[systemLanguages.primary] ?? systemLanguages.primary;
			const secondaryLabel =
				languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;

			return {
				primaryLabel,
				secondaryLabel,
			};
		},
	});
}

const newsSchema = z.object({
	title: z.string().min(1, "Title is required"),
	summary: z.string().optional(),
	content: z.string().min(1, "Content is required"),
	titleSecondary: z.string().optional(),
	summarySecondary: z.string().optional(),
	contentSecondary: z.string().optional(),
	status: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "news",
		permission: "news:update",
		params,
		request,
		schema: newsSchema,
		fetchEntity: (db, id) => db.getNewsById(id),
		onUpdate: ({ db, id, data, newStatus }) => {
			return db.updateNews(id, {
				...data,
				status: (newStatus as any) || (data as any).status,
			});
		},
		successRedirect: (entity) => `/news`,
	});
}

export default function NewsEdit({ loaderData }: Route.ComponentProps) {
	const { news, primaryLabel, secondaryLabel, returnUrl, relationships } =
		loaderData as any;
	const { t } = useTranslation();
	const navigate = useNavigate();

	const inputFields = React.useMemo(
		() => ({
			title: {
				label: t("news.form.title") + ` (${primaryLabel})`,
				value: news.title,
			},
			summary: {
				label: t("news.form.summary") + ` (${primaryLabel})`,
				value: news.summary ?? "",
			},
			content: {
				label: t("news.form.content") + ` (${primaryLabel})`,
				value: news.content,
			},
			titleSecondary: {
				label: t("news.form.title") + ` (${secondaryLabel})`,
				value: news.titleSecondary ?? "",
			},
			summarySecondary: {
				label: t("news.form.summary") + ` (${secondaryLabel})`,
				value: news.summarySecondary ?? "",
			},
			contentSecondary: {
				label: t("news.form.content") + ` (${secondaryLabel})`,
				value: news.contentSecondary ?? "",
			},
		}),
		[news, primaryLabel, secondaryLabel, t],
	);

	return (
		<PageWrapper>
			<EditForm
				title={t("news.edit_title")}
				action=""
				inputFields={inputFields}
				entityId={news.id}
				entityType="news"
				returnUrl={returnUrl || "/news"}
				onCancel={() => navigate(returnUrl || "/news")}
				sourceLanguage={primaryLabel}
				targetLanguage={secondaryLabel}
				translationNamespace="news.form"
				relationships={relationships}
			/>
		</PageWrapper>
	);
}
