import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";

export const MissingApiKeyWarning = () => {
	const { t } = useTranslation();

	return (
		<Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/20">
			<CardHeader>
				<CardTitle className="text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
					<span className="material-symbols-outlined">warning</span>
					AI Features Disabled
				</CardTitle>
				<CardDescription className="text-yellow-700 dark:text-yellow-300">
					You need to configure the OpenRouter API Key in General Settings to
					use AI features.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button variant="outline" asChild>
					<Link to="/settings/general">Go to General Settings</Link>
				</Button>
			</CardContent>
		</Card>
	);
};
