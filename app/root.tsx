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
import type { ClientUser } from "~/contexts/user-context";
import { getDatabase } from "~/db";
import i18next, { getSupportedLanguages } from "~/i18next.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getLanguageNames } from "~/lib/language-names.server";

export async function loader({ request }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	const locale = await i18next.getLocale(request);

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
			primaryLanguage: authUser.primaryLanguage,
			secondaryLanguage: authUser.secondaryLanguage,
		};
	} else {
		// Guest user - get Guest role permissions and default languages
		const { permissions: guestPermissions, languages } = await getGuestContext(
			() => getDatabase(),
		);
		user = {
			userId: "guest",
			email: "",
			name: "Guest",
			roleName: "Guest",
			roleId: "guest",
			permissions: guestPermissions,
			primaryLanguage: languages.primary,
			secondaryLanguage: languages.secondary,
		};
	}

	// Get available languages for client-side
	const supportedLanguages = await getSupportedLanguages();

	// Get language display names (extracted from each language's common.json)
	// This avoids needing to preload all language files on the client
	const languageNames = await getLanguageNames();

	return {
		user,
		siteConfig: SITE_CONFIG,
		locale,
		supportedLanguages,
		languageNames,
	};
}

export const handle = {
	// In the handle export, we can add a i18n key with namespaces our route
	// will need to load. This key can be a single string or an array of strings.
	// TIP: In most cases, you should set this to your defaultNS from your i18n config
	// or if you did not set one, set it to the i18next default namespace "translation"
	i18n: "common",
};

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
	const loaderData = useLoaderData<typeof loader>();
	const locale = loaderData?.locale ?? "en";
	return (
		<html lang={locale}>
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
import { Toaster } from "~/components/ui/sonner";
import { Navigation } from "./components/navigation";
import { InfoReelProvider, useInfoReel } from "./contexts/info-reel-context";
import { LanguageProvider, useLanguage } from "./contexts/language-context";
import { NewTransactionProvider } from "./contexts/new-transaction-context";
import { UserProvider } from "./contexts/user-context";
import { queryClient } from "./lib/query-client";

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

import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

// Language names are now passed from the server via languageNames in loader data
// This eliminates the need for client-side preloading that was causing language switching bugs

export default function App() {
	const { user, siteConfig, locale } = useLoaderData<typeof loader>();
	const { i18n } = useTranslation();

	// Sync server locale to client i18next ONLY on initial mount
	// This ensures the client matches the server after login/logout redirects
	// useLayoutEffect runs synchronously before browser paint, preventing flicker
	useLayoutEffect(() => {
		if (locale && i18n.language !== locale) {
			i18n.changeLanguage(locale);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [i18n.changeLanguage, i18n.language, locale]); // Empty deps - only run on mount

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
	const { isInfoReel } = useLanguage();
	const { t } = useTranslation();

	return (
		<div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
			<div className="z-50 bg-background/80 backdrop-blur-md transition-all duration-300 shrink-0">
				<header className="flex items-center justify-center px-4 pb-2">
					<div className="flex items-center justify-center gap-2 sm:gap-4 md:gap-8 mt-1 sm:mt-2 md:mt-4">
						<span className="text-xl sm:text-3xl md:text-7xl font-black tracking-tighter uppercase text-gray-900 dark:text-white leading-none">
							{siteConfig.shortName || siteConfig.name}
						</span>
						<div className="flex flex-col items-start justify-center h-full text-gray-900 dark:text-white uppercase font-black tracking-widest leading-[0.85] border-l-2 md:border-l-4 border-primary pl-3 sm:pl-4 md:pl-10 py-1 md:py-2">
							{/* Info Reel: Show FI and EN */}
							{isInfoReel && (
								<>
									<span className="text-sm sm:text-2xl md:text-3xl">
										{t("app.title", { lng: "fi" })}
									</span>
									<span className="opacity-90 text-[9px] sm:text-xl md:text-2xl mt-0.5 md:mt-2">
										{t("app.title", { lng: "en" })}
									</span>
								</>
							)}

							{/* Normal Mode: Show current language */}
							{!isInfoReel && (
								<span className="text-sm sm:text-2xl md:text-3xl">
									{t("app.title")}
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
	// Check if this is a configuration/setup error (database, env vars, connection issues)
	const isConfigError =
		error instanceof Error &&
		(error.message.includes("DATABASE_URL") ||
			error.message.includes("environment variable") ||
			error.message.includes("connection") ||
			error.message.includes("ECONNREFUSED") ||
			error.message.includes("connect ECONNREFUSED") ||
			error.message.includes("Connection refused"));

	// If it's a config error, show a helpful setup prompt
	if (isConfigError) {
		return (
			<main className="min-h-screen bg-background flex items-center justify-center p-4">
				<div className="max-w-md w-full space-y-6 text-center">
					<div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full">
						<span className="material-symbols-outlined text-5xl text-primary">
							settings
						</span>
					</div>
					<h1 className="text-2xl font-bold text-foreground">
						Setup Required / Asetukset tarvitaan
					</h1>
					<p className="text-muted-foreground">
						It looks like the app isn't configured yet. Please check your
						environment variables.
					</p>
					<p className="text-sm text-muted-foreground">
						Sovellusta ei ole vielä määritetty. Tarkista ympäristömuuttujat.
					</p>
					<div className="bg-muted p-4 rounded-lg text-left space-y-2">
						<p className="text-sm font-medium">Error details:</p>
						<code className="text-xs text-destructive block overflow-auto">
							{error.message}
						</code>
					</div>
					<a
						href="/setup"
						className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
					>
						<span className="material-symbols-outlined">arrow_forward</span>
						Open Setup Guide
					</a>
					<p className="text-xs text-muted-foreground">
						Or copy <code className="bg-muted px-1 rounded">.env.template</code>{" "}
						to <code className="bg-muted px-1 rounded">.env</code> and configure
						your settings.
					</p>
				</div>
			</main>
		);
	}

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
