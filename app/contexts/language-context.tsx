import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useInfoReel } from "./info-reel-context";

export type Language = "fi" | "en";

interface BilingualText {
    finnish: string;
    english: string;
}

interface LanguageContextValue {
    language: Language;
    setLanguage: (lang: Language) => void;
    getText: (text: BilingualText) => string | ReactNode;
    isInfoReel: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "hippos-portal-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
    const { isInfoReel } = useInfoReel();
    const [language, setLanguageState] = useState<Language>("fi");

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "fi" || stored === "en") {
            setLanguageState(stored);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem(STORAGE_KEY, lang);
    };

    const getText = (text: BilingualText): string | ReactNode => {
        // In info reel mode, we don't return a single string, we return both (handled by components)
        // BUT for simple text consumers, if they call this in info reel mode, 
        // we probably want to return Finnish or both concatenated?
        // Actually, components like PageHeader handle bilingual display themselves when in info reel mode.
        // This helper is primarily for "dumb" components or when we want to force single language.

        if (isInfoReel) {
            // If something blindly calls getText in info reel mode, return Finnish (primary)
            // or maybe a formatted string? Let's return Finnish for now as safe default
            // for places that can't handle custom bilingual UI.
            return text.finnish;
        }

        return language === "fi" ? text.finnish : text.english;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, getText, isInfoReel }}>
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
