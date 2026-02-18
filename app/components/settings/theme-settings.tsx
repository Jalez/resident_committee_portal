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
import {
	generateDarkThemePalette,
	generateLightThemePalette,
	type ThemePalette,
} from "~/lib/theme-palette";
import { cn } from "~/lib/utils";

function applyThemePalette(color: string) {
	const light = generateLightThemePalette(color);
	const dark = generateDarkThemePalette(color);

	const root = document.documentElement;
	root.style.setProperty("--primary", color);
	root.style.setProperty("--ring", color);
	root.style.setProperty("--background", light.background);
	root.style.setProperty("--card", light.card);
	root.style.setProperty("--popover", light.card);
	root.style.setProperty("--muted", light.muted);
	root.style.setProperty("--accent", light.accent);
	root.style.setProperty("--secondary", light.muted);
	root.style.setProperty("--input", light.input);
	root.style.setProperty("--border", light.border);

	if (root.classList.contains("dark")) {
		root.style.setProperty("--background", dark.background);
		root.style.setProperty("--card", dark.card);
		root.style.setProperty("--popover", dark.card);
		root.style.setProperty("--muted", dark.muted);
		root.style.setProperty("--accent", dark.accent);
		root.style.setProperty("--secondary", dark.muted);
		root.style.setProperty("--input", dark.input);
		root.style.setProperty("--border", dark.border);
	}
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

export const generateThemePalette = generateLightThemePalette;

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

	const lightPalette = generateLightThemePalette(lightPrimary);
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
		applyThemePalette(lightPrimary);
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
								className="rounded-xl p-4 space-y-3"
								style={{
									backgroundColor: lightPalette.background,
									color: lightPalette.foreground,
									borderColor: lightPalette.border,
									borderWidth: "1px",
								}}
							>
								<div
									className="rounded-lg p-3"
									style={{
										backgroundColor: lightPalette.card,
										borderColor: lightPalette.border,
										borderWidth: "1px",
									}}
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
													backgroundColor: lightPalette.input,
													width: "60%",
												}}
											/>
											<div
												className="h-2 rounded"
												style={{
													backgroundColor: lightPalette.input,
													width: "80%",
												}}
											/>
										</div>
									</div>
								</div>
								<div
									className="rounded-lg px-3 py-2 text-xs"
									style={{
										backgroundColor: lightPalette.muted,
										borderColor: lightPalette.border,
										borderWidth: "1px",
									}}
								>
									Muted surface sample
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
										className="px-4 py-2 rounded-lg text-sm font-medium"
										style={{
											backgroundColor: lightPalette.accent,
											borderColor: lightPalette.border,
											borderWidth: "1px",
										}}
									>
										{t("common.actions.cancel")}
									</button>
								</div>
							</div>
						</div>

						<div>
							<h4 className="text-sm font-medium mb-3">{t("theme.dark")}</h4>
							<div
								className="rounded-xl p-4 space-y-3"
								style={{
									backgroundColor: darkPalette.background,
									color: darkPalette.foreground,
									borderColor: darkPalette.border,
									borderWidth: "1px",
								}}
							>
								<div
									className="rounded-lg p-3"
									style={{
										backgroundColor: darkPalette.card,
										borderColor: darkPalette.border,
										borderWidth: "1px",
									}}
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
													backgroundColor: darkPalette.input,
													width: "60%",
												}}
											/>
											<div
												className="h-2 rounded"
												style={{
													backgroundColor: darkPalette.input,
													width: "80%",
												}}
											/>
										</div>
									</div>
								</div>
								<div
									className="rounded-lg px-3 py-2 text-xs"
									style={{
										backgroundColor: darkPalette.muted,
										color: darkPalette.foreground,
										borderColor: darkPalette.border,
										borderWidth: "1px",
									}}
								>
									Muted surface sample
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
										className="px-4 py-2 rounded-lg text-sm font-medium"
										style={{
											backgroundColor: darkPalette.accent,
											borderColor: darkPalette.border,
											borderWidth: "1px",
										}}
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
