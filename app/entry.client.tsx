import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import { getInitialNamespaces } from "remix-i18next/client";
import i18n from "./i18n";

async function hydrate() {
	await i18next
		.use(initReactI18next) // Tell i18next to use the react-i18next plugin
		.use(LanguageDetector) // Setup a client-side language detector
		.use(Backend) // Setup your backend
		.init({
			...i18n, // spread the configuration
			ns: getInitialNamespaces(),
			backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
			detection: {
				// cookie to persist the user selection
				order: ["htmlTag", "cookie", "navigator"],
				// Cache the language in a cookie
				caches: ["cookie"],
				// Explicit cookie name
				lookupCookie: "locale",
				cookieOptions: { path: "/", sameSite: "lax" },
			},
		});

	startTransition(() => {
		hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<StrictMode>
					<HydratedRouter />
				</StrictMode>
			</I18nextProvider>,
		);
	});
}

if (window.requestIdleCallback) {
	window.requestIdleCallback(hydrate);
} else {
	// Safari doesn't support requestIdleCallback
	// https://caniuse.com/requestidlecallback
	window.setTimeout(hydrate, 1);
}
