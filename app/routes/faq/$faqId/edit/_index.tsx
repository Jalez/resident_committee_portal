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
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.faq?.question ?? "FAQ"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "faq",
		permission: "faq:update",
		params,
		request,
		fetchEntity: (db, id) => db.getFaqById(id),
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

const faqSchema = z.object({
	question: z.string().min(1, "Question is required"),
	answer: z.string().min(1, "Answer is required"),
	questionSecondary: z.string().optional(),
	answerSecondary: z.string().optional(),
	sortOrder: z.coerce.number().optional().default(0),
	status: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "faq",
		permission: "faq:update",
		params,
		request,
		schema: faqSchema,
		fetchEntity: (db, id) => db.getFaqById(id),
		onUpdate: ({ db, id, data, newStatus }) => {
			return db.updateFaq(id, {
				...data,
				status: (newStatus as any) || (data as any).status,
			});
		},
		successRedirect: (entity) => `/faq`,
	});
}

export default function FaqEdit({ loaderData }: Route.ComponentProps) {
	const { faq, primaryLabel, secondaryLabel, returnUrl, relationships } =
		loaderData as any;
	const { t } = useTranslation();
	const navigate = useNavigate();

	const inputFields = React.useMemo(
		() => ({
			question: {
				label: t("faq.form.question") + ` (${primaryLabel})`,
				value: faq.question,
			},
			answer: {
				label: t("faq.form.answer") + ` (${primaryLabel})`,
				value: faq.answer,
			},
			questionSecondary: {
				label: t("faq.form.question") + ` (${secondaryLabel})`,
				value: faq.questionSecondary ?? "",
			},
			answerSecondary: {
				label: t("faq.form.answer") + ` (${secondaryLabel})`,
				value: faq.answerSecondary ?? "",
			},
			sortOrder: {
				label: t("faq.form.sort_order"),
				value: faq.sortOrder,
			},
		}),
		[faq, primaryLabel, secondaryLabel, t],
	);

	return (
		<PageWrapper>
			<EditForm
				title={t("faq.edit_title")}
				action=""
				inputFields={inputFields}
				entityId={faq.id}
				entityType="faq"
				returnUrl={returnUrl || "/faq"}
				onCancel={() => navigate(returnUrl || "/faq")}
				translationNamespace="faq.form"
				relationships={relationships}
			/>
		</PageWrapper>
	);
}
