import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { getAuthenticatedUser, getGuestPermissions } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getDatabase } from "~/db";
import { cn } from "~/lib/utils";
import type { ClientUser } from "~/contexts/user-context";

export async function loader({ request }: Route.LoaderArgs) {
  const authUser = await getAuthenticatedUser(request, getDatabase);

  let user: ClientUser | null;

  if (authUser) {
    // Logged in user - use their permissions
    user = {
      userId: authUser.userId,
      email: authUser.email,
      name: authUser.name,
      roleName: authUser.roleName || "Unknown",
      roleId: authUser.roleId,
      permissions: authUser.permissions,
    };
  } else {
    // Guest user - get Guest role permissions for navbar visibility
    const guestPermissions = await getGuestPermissions(() => getDatabase());
    user = {
      userId: "guest",
      email: "",
      name: "Guest",
      roleName: "Guest",
      roleId: "guest",
      permissions: guestPermissions,
    };
  }

  return {
    user,
    siteConfig: SITE_CONFIG,
  };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;900&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { Navigation } from "./components/navigation";
import { InfoReelProvider } from "./contexts/info-reel-context";
import { useInfoReel } from "./contexts/info-reel-context";
import { UserProvider } from "./contexts/user-context";
import { LanguageProvider, useLanguage } from "./contexts/language-context";
import { NewTransactionProvider } from "./contexts/new-transaction-context";
import { Toaster } from "~/components/ui/sonner";

function ContentFader({ children }: { children: React.ReactNode }) {
  const { isInfoReel, opacity } = useInfoReel();

  return (
    <div
      className="flex-1 w-full overflow-y-auto transition-opacity duration-100"
      style={isInfoReel ? { opacity } : undefined}
    >
      {children}
    </div>
  );
}

export default function App() {
  const { user, siteConfig } = useLoaderData<typeof loader>();

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider user={user}>
        <NewTransactionProvider>
          <InfoReelProvider>
            <LanguageProvider>
              <AppContent siteConfig={siteConfig} />
            </LanguageProvider>
          </InfoReelProvider>
        </NewTransactionProvider>
      </UserProvider>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

function AppContent({ siteConfig }: { siteConfig: typeof SITE_CONFIG }) {
  const { language, isInfoReel } = useLanguage();

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <div className="z-50 bg-background/80 backdrop-blur-md transition-all duration-300 shrink-0">
        <header className="flex items-center justify-center px-4 pb-2">
          <div className="flex items-center justify-center gap-2 sm:gap-4 md:gap-8 mt-1 sm:mt-2 md:mt-4">
            <span className="text-xl sm:text-3xl md:text-7xl font-black tracking-tighter uppercase text-gray-900 dark:text-white leading-none">
              {siteConfig.shortName || siteConfig.name}
            </span>
            <div className="flex flex-col items-start justify-center h-full text-gray-900 dark:text-white uppercase font-black tracking-widest leading-[0.85] border-l-2 md:border-l-4 border-primary pl-3 sm:pl-4 md:pl-10 py-1 md:py-2">
              {(language === "fi" || isInfoReel) && (
                <span className="text-sm sm:text-2xl md:text-3xl">Asukastoimikunta</span>
              )}
              {(language === "en" || isInfoReel) && (
                <span className={cn(
                  "opacity-90",
                  // In InfoReel (both visible), make English smaller. In single language mode, make it main size.
                  isInfoReel ? "text-[9px] sm:text-xl md:text-2xl mt-0.5 md:mt-2" : "text-sm sm:text-2xl md:text-3xl"
                )}>
                  Tenant Committee
                </span>
              )}
            </div>
          </div>
        </header>

        <nav className="pb-1 sm:pb-2 md:pb-4">
          <Navigation orientation="horizontal" />
        </nav>

      </div>

      {/* Main Content Area - fades during info reel transitions */}
      <ContentFader>
        <Outlet />
      </ContentFader>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
