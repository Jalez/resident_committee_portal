import { useTranslation } from "react-i18next";
import { SectionCard } from "~/components/treasury/section-card";

type ReservationOption = {
	id: string;
	name: string;
	remainingAmount: number;
};

interface ReservationLinkSectionProps {
	openReservations: ReservationOption[];
	selectedReservationId: string;
	onSelectionChange: (id: string) => void;
	amount: string;
}

export function ReservationLinkSection({
	openReservations,
	selectedReservationId,
	onSelectionChange,
	amount,
}: ReservationLinkSectionProps) {
	const { t } = useTranslation();

	if (openReservations.length === 0) {
		return null;
	}

	return (
		<SectionCard>
			<input type="hidden" name="reservationId" value={selectedReservationId} />
			<input type="hidden" name="reservationAmount" value={amount} />

			<div className="space-y-3">
				<label className="text-base font-bold">
					{t("treasury.new.link_reservation")}
				</label>
				<p className="text-sm text-gray-500 dark:text-gray-400">
					{t("treasury.new.link_reservation_help")}
				</p>
				<select
					className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					value={selectedReservationId || "none"}
					onChange={(event) =>
						onSelectionChange(event.target.value === "none" ? "" : event.target.value)
					}
				>
					<option value="none">{t("treasury.new.no_reservation")}</option>
					{openReservations.map((res) => (
						<option key={res.id} value={res.id}>
							{res.name} - {t("treasury.reservations.remaining")}: {res.remainingAmount.toFixed(2).replace(".", ",")} €
						</option>
					))}
				</select>
				{selectedReservationId && (
					<p className="text-xs text-muted-foreground">
						{t("treasury.new.reservation_note")}
					</p>
				)}
			</div>
		</SectionCard>
	);
}
