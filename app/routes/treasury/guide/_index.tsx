import { useTranslation } from "react-i18next";
import {
	ContentArea,
	PageWrapper,
	SplitLayout,
} from "~/components/layout/page-layout";
import { ScenarioGuide } from "~/components/scenario-guide";
import { getDatabase } from "~/db/server.server";
import {
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Rahaston opas / Treasury Guide`,
		},
		{ name: "description", content: "Rahaston käyttöopas" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnyPermission(
		request,
		["treasury:read"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const systemLanguages = await getSystemLanguageDefaults();
	return { siteConfig: SITE_CONFIG, systemLanguages };
}

export default function TreasuryGuide({ loaderData }: Route.ComponentProps) {
	const { systemLanguages } = loaderData;
	const { t } = useTranslation();

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("treasury.guide.title", {
						lng: systemLanguages.primary,
					}),
					secondary: t("treasury.guide.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
			>
				<ContentArea>
					<ScenarioGuide
						i18nPrefix="treasury.guide"
						t={t}
					/>
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
