import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ReactNode, useEffect } from "react";

/**
 * Listens for postMessage events from a parent iframe (e.g. portfolio site)
 * to sync the theme. Message format: { type: 'THEME_CHANGE', theme: 'dark' | 'light' }
 */
function IframeThemeListener() {
	const { setTheme } = useTheme();

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (
				event.data?.type === "THEME_CHANGE" &&
				(event.data.theme === "dark" || event.data.theme === "light")
			) {
				setTheme(event.data.theme);
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [setTheme]);

	return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<IframeThemeListener />
			{children}
		</NextThemesProvider>
	);
}
