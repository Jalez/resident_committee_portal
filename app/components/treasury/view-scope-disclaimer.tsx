import { InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "~/components/ui/alert";

interface ViewScopeDisclaimerProps {
	canReadAll: boolean;
	itemType:
		| "receipts"
		| "transactions"
		| "reimbursements"
		| "budgets"
		| "breakdown";
}

export function ViewScopeDisclaimer({
	canReadAll,
	itemType,
}: ViewScopeDisclaimerProps) {
	const { t } = useTranslation();

	const itemTypeKey = `permissions.treasury.view_scope.item_types.${itemType}`;
	const itemTypeLabel = t(itemTypeKey, {
		defaultValue: itemType,
	});

	const messageKey = canReadAll
		? "permissions.treasury.view_scope.all"
		: "permissions.treasury.view_scope.own_only";

	const message = t(messageKey, { itemType: itemTypeLabel });

	return (
		<Alert variant="info">
			<InfoIcon className="size-4" />
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
