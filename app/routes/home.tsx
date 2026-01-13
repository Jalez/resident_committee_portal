import type { Route } from "./+types/home";
import { PageWrapper, SplitLayout, QRPanel, ContentArea } from "~/components/layout/page-layout";
import { SITE_CONFIG } from "~/lib/config.server";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.siteConfig?.name || "Portal"} - Etusivu / Home` },
    { name: "description", content: data?.siteConfig?.description || "" },
  ];
}

interface InvolvementOption {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
}

export function loader({ }: Route.LoaderArgs) {
  return {
    siteConfig: SITE_CONFIG,
    options: [
      {
        id: "committee",
        title: "Hae toimikuntaan",
        subtitle: "Apply for the Tenant Committee",
        icon: "diversity_3",
      },
      {
        id: "events",
        title: "Ehdota tapahtumia",
        subtitle: "Suggest Events",
        icon: "celebration",
      },
      {
        id: "purchases",
        title: "Pyydä hankintoja",
        subtitle: "Request Purchases",
        icon: "shopping_cart",
      },
      {
        id: "questions",
        title: "Esitä kysymyksiä",
        subtitle: "Submit Questions",
        icon: "question_mark",
      },
    ] as InvolvementOption[],
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { options } = loaderData;

  // QR Panel only shown in info reel mode
  const RightContent = (
    <QRPanel
      qrPath="/contact"
      title={
        <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
          Ota yhteyttä <br />
          <span className="text-lg text-gray-400 font-bold">Contact Us</span>
        </h2>
      }
    />
  );

  return (
    <PageWrapper>
      <SplitLayout
        right={RightContent}
        header={{ finnish: "Osallistu", english: "Get Involved" }}
      >
        <ContentArea className="space-y-4">
          {options.map((option) => (
            <a
              key={option.id}
              href={`/contact?type=${option.id}`}
              className="flex items-center gap-3 dark:bg-card transition-all cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-2xl p-2 -ml-2"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-3xl">
                  {option.icon}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl md:text-3xl font-bold text-gray-900 dark:text-white leading-tight group-hover:text-primary transition-colors">
                  {option.title}
                </h3>
                <p className="text-lg md:text-3xl font-medium text-gray-500 dark:text-gray-400">
                  {option.subtitle}
                </p>
              </div>
              <span className="material-symbols-outlined text-2xl text-gray-300 dark:text-gray-600 group-hover:text-primary group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </a>
          ))}
        </ContentArea>
      </SplitLayout>
    </PageWrapper>
  );
}

