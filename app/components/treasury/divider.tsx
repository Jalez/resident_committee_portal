import { useTranslation } from "react-i18next";

interface DividerProps {
	/** Custom text to display in the divider. Defaults to "OR" */
	text?: string;
	/** Translation key for the divider text */
	translationKey?: string;
}

/**
 * Reusable divider component with centered text.
 * Used to separate options in forms (e.g., "OR" between link existing and create new).
 */
export function Divider({ text, translationKey }: DividerProps) {
	const { t } = useTranslation();
	const displayText = text || (translationKey ? t(translationKey) : t("treasury.new.or"));

	return (
		<div className="relative py-2">
			<div className="absolute inset-0 flex items-center">
				<div className="w-full border-t border-gray-200 dark:border-gray-700" />
			</div>
			<div className="relative flex justify-center text-xs uppercase">
				<span className="bg-white dark:bg-gray-800 px-2 text-gray-500">
					{displayText}
				</span>
			</div>
		</div>
	);
}
