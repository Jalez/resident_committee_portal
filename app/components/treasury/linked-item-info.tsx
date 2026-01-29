import { useTranslation } from "react-i18next";
import type { Purchase } from "~/db";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";

interface LinkedTransactionInfoProps {
	/** Description value */
	description: string;
	/** Amount value */
	amount: string;
	/** Date value */
	date: string;
	/** Year value */
	year: number;
}

interface LinkedPurchaseInfoProps {
	/** The linked purchase */
	purchase: Purchase;
}

/**
 * Reusable component for displaying linked item information.
 * Shows transaction details when linking to an existing transaction,
 * or purchase/reimbursement details when linking to an existing purchase.
 */
export function LinkedItemInfo(
	props: LinkedTransactionInfoProps | LinkedPurchaseInfoProps,
) {
	const { t } = useTranslation();

	// Check if it's transaction info or purchase info
	if ("purchase" in props) {
		const { purchase } = props;
		return (
			<Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 mt-4 py-0 gap-0">
				<CardHeader className="px-4 pt-4 pb-3">
					<CardTitle className="text-blue-800 dark:text-blue-300">
						{t("treasury.breakdown.edit.linked_reimbursement")}
					</CardTitle>
				</CardHeader>
				<CardContent className="px-4 pb-4">
					<div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
						<div className="min-w-[120px]">
							<p className="text-blue-600 dark:text-blue-400">
								{t("treasury.breakdown.edit.purchaser")}
							</p>
							<p className="font-medium">{purchase.purchaserName}</p>
						</div>
						<div className="min-w-[120px]">
							<p className="text-blue-600 dark:text-blue-400">
								{t("treasury.breakdown.edit.iban")}
							</p>
							<p className="font-mono text-xs">{purchase.bankAccount}</p>
						</div>
						<div className="min-w-[120px]">
							<p className="text-blue-600 dark:text-blue-400">
								{t("treasury.breakdown.edit.minutes")}
							</p>
							{purchase.minutesId ? (
								<a
									href={`https://drive.google.com/file/d/${purchase.minutesId}/view`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-1"
								>
									{purchase.minutesName || purchase.minutesId}
									<span className="material-symbols-outlined text-xs">
										open_in_new
									</span>
								</a>
							) : (
								<p className="font-medium">—</p>
							)}
						</div>
						<div className="min-w-[120px]">
							<p className="text-blue-600 dark:text-blue-400">
								{t("treasury.breakdown.edit.email")}
							</p>
							<p className="font-medium">
								{purchase.emailSent
									? t("treasury.breakdown.edit.email_sent")
									: t("treasury.breakdown.edit.email_not_sent")}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	const { description, amount, date, year } = props;
	return (
		<Card className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 mt-4 py-0 gap-0">
			<CardHeader className="px-4 pt-4 pb-3">
				<CardDescription>
					{t("treasury.new_reimbursement.linked_transaction_info")}
				</CardDescription>
			</CardHeader>
			<CardContent className="px-4 pb-4">
				<div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
					<div className="min-w-[120px]">
						<p className="text-gray-500">{t("treasury.form.description")}</p>
						<p className="font-medium">{description}</p>
					</div>
					<div className="min-w-[120px]">
						<p className="text-gray-500">{t("treasury.form.amount")}</p>
						<p className="font-medium">{amount} €</p>
					</div>
					<div className="min-w-[120px]">
						<p className="text-gray-500">{t("treasury.form.date")}</p>
						<p className="font-medium">{date}</p>
					</div>
					<div className="min-w-[120px]">
						<p className="text-gray-500">{t("treasury.form.year")}</p>
						<p className="font-medium">{year}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
