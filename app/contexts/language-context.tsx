import { createContext, type ReactNode, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useRouteLoaderData } from "react-router";
import { useInfoReel } from "./info-reel-context";
import { useUser } from "./user-context";

export type Language = string;

interface BilingualText {
	finnish: string;
	english: string;
}

interface LanguageContextValue {
	language: Language;
	setLanguage: (lang: Language) => void;
	getText: (text: BilingualText) => string | ReactNode;
	isInfoReel: boolean;
	primaryLanguage: string;
	secondaryLanguage: string;
	supportedLanguages: string[];
	languageNames: Record<string, string>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
	const { isInfoReel } = useInfoReel();
	const { i18n } = useTranslation();
	const { user } = useUser();

	// Get supported languages and language names from root loader
	const rootData = useRouteLoaderData<typeof import("~/root").loader>("root");
	const supportedLanguages = rootData?.supportedLanguages || ["en", "fi", "sv"];
	const languageNames = rootData?.languageNames || {};

	// Default to fi/en if user not loaded yet (though this provider is inside UserProvider)
	// or if user is somehow null (shouldn't be for guest context)
	const primaryLanguage = user?.primaryLanguage || "fi";
	const secondaryLanguage = user?.secondaryLanguage || "en";

	// Derived state from i18next - use the current language or fallback to first supported language
	const currentLang = i18n.language || supportedLanguages[0] || "en";
	const language = supportedLanguages.includes(currentLang)
		? currentLang
		: supportedLanguages[0] || "en";

	const setLanguage = (lang: Language) => {
		i18n.changeLanguage(lang);
	};

	const getText = (text: BilingualText): string | ReactNode => {
		// Legacy support helper
		if (isInfoReel) {
			return text.finnish;
		}
		if (language === "fi") return text.finnish;
		// Fallback to English for other languages as we don't have trilingual content in DB
		return text.english;
	};

	return (
		<LanguageContext.Provider
			value={{
				language,
				setLanguage,
				getText,
				isInfoReel,
				primaryLanguage,
				secondaryLanguage,
				supportedLanguages,
				languageNames,
			}}
		>
			{children}
		</LanguageContext.Provider>
	);
}

export function useLanguage() {
	const context = useContext(LanguageContext);
	if (!context) {
		throw new Error("useLanguage must be used within a LanguageProvider");
	}
	return context;
}
