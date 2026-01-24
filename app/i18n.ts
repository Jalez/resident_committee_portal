// This is the language you want to use in case
// if the user language is not in the supportedLngs
const fallbackLng = "en";

export const config = {
	// supportedLngs will be set dynamically on server-side
	// For client-side, we'll pass it via loader data
	fallbackLng,
	// The default namespace of i18next is "translation", but you can customize it here
	defaultNS: "common",
	// Disabling suspense is recommended when using server-side rendering
	react: { useSuspense: false },
};

export default config;
