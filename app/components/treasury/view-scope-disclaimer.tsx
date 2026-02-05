import { InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "~/components/ui/alert";

interface ViewScopeDisclaimerProps {
	canReadAll: boolean;
	itemType: "receipts" | "transactions" | "reimbursements" | "budgets" | "breakdown";
}

export function ViewScopeDisclaimer({
	canReadAll,
	itemType,
}: ViewScopeDisclaimerProps) {
	const { t } = useTranslation();

	const itemTypeKey = `treasury.view_scope.item_types.${itemType}`;
	const itemTypeLabel = t(itemTypeKey, {
		defaultValue: itemType,
	});

	const messageKey = canReadAll
		? "treasury.view_scope.all"
		: "treasury.view_scope.own_only";

	const message = t(messageKey, {
		itemType: itemTypeLabel,
		defaultValue: canReadAll
			? `You are viewing all ${itemType}`
			: `You are viewing only your own ${itemType}`,
	});

	return (
		<Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
			<InfoIcon className="size-4 text-blue-600 dark:text-blue-400" />
			<AlertDescription className="text-blue-800 dark:text-blue-300">
				{message}
			</AlertDescription>
		</Alert>
	);
}
