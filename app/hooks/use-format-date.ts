import { useLanguage } from "~/contexts/language-context";
import { formatDate } from "~/lib/format-utils";

/**
 * Hook that returns a formatDate function using the app-wide date locale setting.
 * Use this in any component that needs to format dates.
 *
 * @example
 * const { formatDate } = useFormatDate();
 * return <span>{formatDate(someDate)}</span>;
 */
export function useFormatDate() {
    const { dateLocale } = useLanguage();

    return {
        dateLocale,
        formatDate: (date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions) =>
            formatDate(date, dateLocale, options),
    };
}
