export interface ThemePalette {
	primary: string;
	background: string;
	foreground: string;
	card: string;
	muted: string;
	accent: string;
	input: string;
	border: string;
}

function hexToHue(hex: string): number {
	const normalized = hex.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 20;

	const r = parseInt(normalized.slice(0, 2), 16) / 255;
	const g = parseInt(normalized.slice(2, 4), 16) / 255;
	const b = parseInt(normalized.slice(4, 6), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	if (delta === 0) return 20;

	let hue = 0;
	if (max === r) {
		hue = ((g - b) / delta) % 6;
	} else if (max === g) {
		hue = (b - r) / delta + 2;
	} else {
		hue = (r - g) / delta + 4;
	}

	const degrees = hue * 60;
	return degrees < 0 ? degrees + 360 : degrees;
}

export function generateLightThemePalette(primaryHex: string): ThemePalette {
	const h = hexToHue(primaryHex);
	return {
		primary: primaryHex,
		foreground: "oklch(0.145 0 0)",
		background: `oklch(0.99 0.002 ${h})`,
		card: `oklch(1 0 ${h})`,
		muted: `oklch(0.97 0.01 ${h})`,
		accent: `oklch(0.92 0.02 ${h})`,
		input: `oklch(0.92 0.01 ${h})`,
		border: `oklch(0.92 0.01 ${h})`,
	};
}

export function generateDarkThemePalette(primaryHex: string): ThemePalette {
	const h = hexToHue(primaryHex);
	return {
		primary: primaryHex,
		foreground: "oklch(0.985 0 0)",
		background: `oklch(0.13 0.015 ${h})`,
		card: `oklch(0.18 0.02 ${h})`,
		muted: `oklch(0.22 0.015 ${h})`,
		accent: `oklch(0.22 0.015 ${h})`,
		input: `oklch(0.30 0.015 ${h} / 0.45)`,
		border: `oklch(0.92 0.01 ${h} / 0.14)`,
	};
}

