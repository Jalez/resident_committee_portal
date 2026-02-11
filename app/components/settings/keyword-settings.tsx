import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface KeywordSettingsProps {
	settings: {
		approvalKeywords: string;
		rejectionKeywords: string;
	};
	defaultKeywords: {
		approval: string[];
		rejection: string[];
	};
}

export function KeywordSettings({
	settings,
	defaultKeywords,
}: KeywordSettingsProps) {
	const { t } = useTranslation();

	const [approvalKeywords, setApprovalKeywords] = useState(
		settings.approvalKeywords,
	);
	const [rejectionKeywords, setRejectionKeywords] = useState(
		settings.rejectionKeywords,
	);

	// Sync state with props when settings change
	useEffect(() => {
		setApprovalKeywords(settings.approvalKeywords);
	}, [settings.approvalKeywords]);

	useEffect(() => {
		setRejectionKeywords(settings.rejectionKeywords);
	}, [settings.rejectionKeywords]);

	// Parse custom keywords string to array
	const getCustomKeywordsList = (keywordString: string) => {
		return keywordString
			.split(",")
			.map((k) => k.trim())
			.filter((k) => k.length > 0);
	};

	const customApprovalList = getCustomKeywordsList(approvalKeywords);
	const customRejectionList = getCustomKeywordsList(rejectionKeywords);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
			<KeywordSettingsCard
				title={`${t("settings.reimbursements.keywords_title")} (Approval)`}
				badgeTitle={t("settings.reimbursements.default_approval")}
				additionalKeywordsTitle={t(
					"settings.reimbursements.additional_approval",
				)}
				description={t("settings.reimbursements.keywords_desc")}
				defaultKeywords={defaultKeywords.approval}
				customKeywords={customApprovalList}
				setCustomKeywords={setApprovalKeywords}
				intent="save-approval-keywords"
			/>

			<KeywordSettingsCard
				title={`${t("settings.reimbursements.keywords_title")} (Rejection)`}
				badgeTitle={t("settings.reimbursements.default_rejection")}
				additionalKeywordsTitle={t(
					"settings.reimbursements.additional_rejection",
				)}
				description={t("settings.reimbursements.keywords_desc")}
				defaultKeywords={defaultKeywords.rejection}
				customKeywords={customRejectionList}
				setCustomKeywords={setRejectionKeywords}
				intent="save-rejection-keywords"
			/>
		</div>
	);
}

const KeywordSettingsCard = ({
	title,
	badgeTitle,
	additionalKeywordsTitle,
	description,
	defaultKeywords,
	customKeywords,
	setCustomKeywords,
	intent,
}: {
	title: string;
	badgeTitle: string;
	additionalKeywordsTitle: string;
	description: string;
	defaultKeywords: string[];
	customKeywords: string[];
	setCustomKeywords: (keywords: string) => void;
	intent: string;
}) => {
	const fetcher = useFetcher();

	useEffect(() => {
		if (fetcher.data) {
			if ("error" in fetcher.data) {
				toast.error(fetcher.data.error, { id: `${intent}-error` });
			} else if ("message" in fetcher.data) {
				toast.success(fetcher.data.message, { id: `${intent}-success` });
			}
		}
	}, [fetcher.data, intent]);

	const { t } = useTranslation();
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label>{badgeTitle}</Label>
					<div className="flex flex-wrap gap-2">
						{defaultKeywords.map((keyword) => (
							<Badge key={`default-${keyword}`} variant="secondary">
								{keyword}
							</Badge>
						))}
						{customKeywords.map((keyword) => (
							<Badge
								key={`custom-${keyword}`}
								className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
							>
								{keyword}
							</Badge>
						))}
					</div>
				</div>

				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value={intent} />
					<div className="space-y-2">
						<Label htmlFor="approval-keywords">{additionalKeywordsTitle}</Label>
						<Input
							id="approval-keywords"
							name="keywords"
							value={customKeywords.join(",")}
							onChange={(e) => setCustomKeywords(e.target.value)}
							placeholder={t("settings.reimbursements.approval_placeholder")}
						/>
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
};
