"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { ColorPicker, ColorSwatch } from "~/components/ui/color-picker";
import { cn } from "~/lib/utils";

function applyThemeColor(color: string) {
	document.documentElement.style.setProperty("--primary", color);
	document.documentElement.style.setProperty("--ring", color);
}

export interface ThemePalette {
	primary: string;
	background: string;
	card: string;
	muted: string;
	accent: string;
}

export interface ThemePaletteInput {
	primary: string;
}

const THEME_PRESETS: { name: string; primary: string; label: string }[] = [
	{ name: "red", primary: "#ff2446", label: "Red" },
	{ name: "rose", primary: "#e11d48", label: "Rose" },
	{ name: "orange", primary: "#f97316", label: "Orange" },
	{ name: "amber", primary: "#f59e0b", label: "Amber" },
	{ name: "green", primary: "#22c55e", label: "Green" },
	{ name: "emerald", primary: "#10b981", label: "Emerald" },
	{ name: "teal", primary: "#14b8a6", label: "Teal" },
	{ name: "cyan", primary: "#06b6d4", label: "Cyan" },
	{ name: "blue", primary: "#3b82f6", label: "Blue" },
	{ name: "indigo", primary: "#6366f1", label: "Indigo" },
	{ name: "violet", primary: "#8b5cf6", label: "Violet" },
	{ name: "purple", primary: "#a855f7", label: "Purple" },
	{ name: "pink", primary: "#ec4899", label: "Pink" },
	{ name: "slate", primary: "#64748b", label: "Slate" },
	{ name: "neutral", primary: "#737373", label: "Neutral" },
];

function hexToOklch(hex: string): { l: number; c: number; h: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return null;

	let r = parseInt(result[1], 16) / 255;
	let g = parseInt(result[2], 16) / 255;
	let b = parseInt(result[3], 16) / 255;

	r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
	g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
	b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;

	r *= 100;
	g *= 100;
	b *= 100;

	const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
	const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
	const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

	const l = 116 * (y / 100) - 16;
	const a = 500 * (x / 100 - y / 100);
	const bVal = 200 * (y / 100 - z / 100);

	const C = Math.sqrt(a * a + bVal * bVal) / 100;
	const H = Math.atan2(bVal, a) * (180 / Math.PI);

	return {
		l: Math.max(0, Math.min(1, l / 100)),
		c: Math.max(0, Math.min(0.4, C)),
		h: H < 0 ? H + 360 : H,
	};
}

function oklchToHex(l: number, c: number, h: number): string {
	const hRad = h * (Math.PI / 180);
	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);

	const L = l;
	const Ca = a;
	const Cb = b;

	const Y = (L + 0.16) / 1.167;
	const X = Y + Ca / 5 + Cb / 10;
	const Z = Y - Ca / 5 - Cb / 5;

	const rLinear = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
	const gLinear = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
	const bLinear = X * 0.0557 - Y * 0.204 + Z * 1.057;

	const gammaCorrect = (v: number) =>
		v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;

	const r = Math.round(Math.max(0, Math.min(255, gammaCorrect(rLinear) * 255)));
	const g = Math.round(Math.max(0, Math.min(255, gammaCorrect(gLinear) * 255)));
	const bVal = Math.round(
		Math.max(0, Math.min(255, gammaCorrect(bLinear) * 255)),
	);

	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bVal.toString(16).padStart(2, "0")}`;
}

export function generateThemePalette(primaryHex: string): ThemePalette {
	const primary = hexToOklch(primaryHex);
	if (!primary) {
		return {
			primary: primaryHex,
			background: "#ffffff",
			card: "#ffffff",
			muted: "#f4f4f5",
			accent: "#f4f4f5",
		};
	}

	const { l, c, h } = primary;

	return {
		primary: primaryHex,
		background: oklchToHex(0.99, 0.002, h),
		card: oklchToHex(1, 0, h),
		muted: oklchToHex(0.97, 0.01, h),
		accent: oklchToHex(0.92, Math.min(c * 0.5, 0.05), h),
	};
}

export function generateDarkThemePalette(primaryHex: string): ThemePalette {
	const primary = hexToOklch(primaryHex);
	if (!primary) {
		return {
			primary: primaryHex,
			background: "#0c0c0c",
			card: "#18181b",
			muted: "#27272a",
			accent: "#27272a",
		};
	}

	const { l, c, h } = primary;

	return {
		primary: primaryHex,
		background: oklchToHex(0.13, 0.015, h),
		card: oklchToHex(0.18, 0.02, h),
		muted: oklchToHex(0.22, 0.015, h),
		accent: oklchToHex(0.22, Math.min(c * 0.3, 0.03), h),
	};
}

interface ThemeSettingsProps {
	currentPrimary?: string;
}

export function ThemeSettings({ currentPrimary }: ThemeSettingsProps) {
	const { t } = useTranslation();
	const fetcher = useFetcher();

	const [lightPrimary, setLightPrimary] = useState(currentPrimary || "#ff2446");
	const [hasChanges, setHasChanges] = useState(false);

	useEffect(() => {
		if (currentPrimary) {
			setLightPrimary(currentPrimary);
		}
	}, [currentPrimary]);

	useEffect(() => {
		setHasChanges(lightPrimary !== (currentPrimary || "#ff2446"));
	}, [lightPrimary, currentPrimary]);

	const lightPalette = generateThemePalette(lightPrimary);
	const darkPalette = generateDarkThemePalette(lightPrimary);

	const handlePresetClick = (primary: string) => {
		setLightPrimary(primary);
	};

	const handleSave = () => {
		fetcher.submit(
			{ primary: lightPrimary },
			{ method: "post", action: "/api/set-theme-palette" },
		);
		setHasChanges(false);
		applyThemeColor(lightPrimary);
	};

	const handleReset = () => {
		setLightPrimary("#ff2446");
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>{t("settings.theme.presets_title")}</CardTitle>
					<CardDescription>{t("settings.theme.presets_desc")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
						{THEME_PRESETS.map((preset) => (
							<ColorSwatch
								key={preset.name}
								color={preset.primary}
								label={preset.label}
								selected={
									lightPrimary.toLowerCase() === preset.primary.toLowerCase()
								}
								onClick={() => handlePresetClick(preset.primary)}
							/>
						))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("settings.theme.custom_title")}</CardTitle>
					<CardDescription>{t("settings.theme.custom_desc")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div>
							<span className="text-sm font-medium mb-2 block">
								{t("settings.theme.primary_color")}
							</span>
							<ColorPicker value={lightPrimary} onChange={setLightPrimary} />
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("settings.theme.preview_title")}</CardTitle>
					<CardDescription>{t("settings.theme.preview_desc")}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid md:grid-cols-2 gap-6">
						<div>
							<h4 className="text-sm font-medium mb-3">{t("theme.light")}</h4>
							<div
								className="rounded-xl border p-4 space-y-3"
								style={{ backgroundColor: lightPalette.background }}
							>
								<div
									className="rounded-lg border p-3"
									style={{ backgroundColor: lightPalette.card }}
								>
									<div className="flex items-center gap-3">
										<div
											className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
											style={{ backgroundColor: lightPalette.primary }}
										>
											A
										</div>
										<div className="flex-1 space-y-1">
											<div
												className="h-3 rounded"
												style={{
													backgroundColor: lightPalette.muted,
													width: "60%",
												}}
											/>
											<div
												className="h-2 rounded"
												style={{
													backgroundColor: lightPalette.muted,
													width: "80%",
												}}
											/>
										</div>
									</div>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										className="px-4 py-2 rounded-lg text-white text-sm font-medium"
										style={{ backgroundColor: lightPalette.primary }}
									>
										{t("common.actions.save")}
									</button>
									<button
										type="button"
										className="px-4 py-2 rounded-lg text-sm font-medium border"
										style={{ backgroundColor: lightPalette.accent }}
									>
										{t("common.actions.cancel")}
									</button>
								</div>
							</div>
						</div>

						<div>
							<h4 className="text-sm font-medium mb-3">{t("theme.dark")}</h4>
							<div
								className="rounded-xl border p-4 space-y-3"
								style={{ backgroundColor: darkPalette.background }}
							>
								<div
									className="rounded-lg border p-3"
									style={{ backgroundColor: darkPalette.card }}
								>
									<div className="flex items-center gap-3">
										<div
											className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
											style={{ backgroundColor: darkPalette.primary }}
										>
											A
										</div>
										<div className="flex-1 space-y-1">
											<div
												className="h-3 rounded"
												style={{
													backgroundColor: darkPalette.muted,
													width: "60%",
												}}
											/>
											<div
												className="h-2 rounded"
												style={{
													backgroundColor: darkPalette.muted,
													width: "80%",
												}}
											/>
										</div>
									</div>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										className="px-4 py-2 rounded-lg text-white text-sm font-medium"
										style={{ backgroundColor: darkPalette.primary }}
									>
										{t("common.actions.save")}
									</button>
									<button
										type="button"
										className="px-4 py-2 rounded-lg text-sm font-medium border"
										style={{ backgroundColor: darkPalette.accent }}
									>
										{t("common.actions.cancel")}
									</button>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="flex items-center justify-end gap-3">
				<Button variant="outline" onClick={handleReset}>
					<RotateCcw className="h-4 w-4 mr-2" />
					{t("settings.theme.reset")}
				</Button>
				<Button onClick={handleSave} disabled={!hasChanges}>
					<Check className="h-4 w-4 mr-2" />
					{t("common.actions.save")}
				</Button>
			</div>
		</div>
	);
}
