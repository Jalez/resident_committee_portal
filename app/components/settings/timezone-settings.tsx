import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

const COMMON_TIMEZONES = [
	"UTC",
	"Europe/Helsinki",
	"Europe/Stockholm",
	"Europe/Oslo",
	"Europe/Copenhagen",
	"Europe/Berlin",
	"Europe/Paris",
	"Europe/London",
	"Europe/Madrid",
	"Europe/Rome",
	"Europe/Amsterdam",
	"Europe/Brussels",
	"Europe/Vienna",
	"Europe/Zurich",
	"Europe/Prague",
	"Europe/Warsaw",
	"Europe/Athens",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"America/Toronto",
	"America/Vancouver",
	"America/Mexico_City",
	"America/Sao_Paulo",
	"America/Buenos_Aires",
	"Asia/Tokyo",
	"Asia/Shanghai",
	"Asia/Hong_Kong",
	"Asia/Singapore",
	"Asia/Seoul",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Australia/Sydney",
	"Australia/Melbourne",
	"Australia/Perth",
	"Pacific/Auckland",
];

interface TimezoneSettingsProps {
	currentTimezone: string;
	detectedTimezone?: string;
}

export function TimezoneSettings({
	currentTimezone,
	detectedTimezone,
}: TimezoneSettingsProps) {
	const { t } = useTranslation();
	const fetcher = useFetcher();
	const [selectedTimezone, setSelectedTimezone] = useState(currentTimezone);
	const [showCustom, setShowCustom] = useState(
		!COMMON_TIMEZONES.includes(currentTimezone) && currentTimezone !== "UTC",
	);

	useEffect(() => {
		if (fetcher.data) {
			if ("success" in fetcher.data && fetcher.data.success) {
				toast.success(t("common.status.saved"), {
					id: "timezone-settings-success",
				});
			} else if ("error" in fetcher.data) {
				toast.error(t("common.status.error"), {
					id: "timezone-settings-error",
				});
			}
		}
	}, [fetcher.data, t]);

	const handleDetectTimezone = () => {
		if (detectedTimezone) {
			setSelectedTimezone(detectedTimezone);
			if (COMMON_TIMEZONES.includes(detectedTimezone)) {
				setShowCustom(false);
			} else {
				setShowCustom(true);
			}
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span className="material-symbols-outlined">schedule</span>
					{t("settings.general.timezone_title")}
				</CardTitle>
				<CardDescription>
					{t("settings.general.timezone_desc")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="save-timezone" />
					
					<div className="space-y-2">
						<Label htmlFor="timezone">{t("settings.general.default_timezone")}</Label>
						<div className="flex gap-2">
							{!showCustom ? (
								<Select
									name="timezone"
									value={selectedTimezone}
									onValueChange={setSelectedTimezone}
								>
									<SelectTrigger className="flex-1">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{COMMON_TIMEZONES.map((tz) => (
											<SelectItem key={tz} value={tz}>
												{tz.replace(/_/g, " ")}
											</SelectItem>
										))}
										<SelectItem value="__custom__">
											{t("settings.general.other_timezone")}
										</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<input
									type="text"
									name="timezone"
									value={selectedTimezone}
									onChange={(e) => setSelectedTimezone(e.target.value)}
									placeholder="Continent/City"
									className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
								/>
							)}
							{detectedTimezone && detectedTimezone !== selectedTimezone && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleDetectTimezone}
									title={t("settings.general.use_detected", {
										timezone: detectedTimezone,
									})}
								>
									<span className="material-symbols-outlined text-sm">
										my_location
									</span>
								</Button>
							)}
						</div>
						{showCustom && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setShowCustom(false);
									setSelectedTimezone("UTC");
								}}
							>
								{t("settings.general.show_common")}
							</Button>
						)}
						{selectedTimezone === "__custom__" && (
							<div className="pt-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										setShowCustom(true);
										setSelectedTimezone(detectedTimezone || "");
									}}
								>
									{t("settings.general.enter_custom")}
								</Button>
							</div>
						)}
					</div>

					<Button type="submit" disabled={fetcher.state !== "idle"}>
						{fetcher.state === "idle"
							? t("common.actions.save")
							: t("common.status.saving")}
					</Button>
				</fetcher.Form>
			</CardContent>
		</Card>
	);
}
