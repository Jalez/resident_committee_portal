import type { InventoryItem } from "~/db";

interface InventoryInfoReelCardProps {
	items: InventoryItem[];
}

import { useTranslation } from "react-i18next";

export function InventoryInfoReelCards({ items }: InventoryInfoReelCardProps) {
	const { t } = useTranslation();

	if (items.length === 0) {
		return (
			<div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-6 text-center">
				<span className="material-symbols-outlined text-4xl text-gray-400 mb-2">
					inventory_2
				</span>
				<p className="text-gray-600 dark:text-gray-400">
					{t("inventory.info_reel.no_items")}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{items.map((item: InventoryItem) => (
				<div
					key={item.id}
					className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 space-y-2"
				>
					<h3 className="text-xl lg:text-2xl font-black text-gray-900 dark:text-white">
						{item.name}
					</h3>
					<div className="flex flex-wrap gap-2 text-sm">
						<span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
							<span className="material-symbols-outlined text-base">
								inventory_2
							</span>
							{item.quantity} kpl
						</span>
						<span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
							<span className="material-symbols-outlined text-base">
								location_on
							</span>
							{item.location}
						</span>
						{item.category && (
							<span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
								<span className="material-symbols-outlined text-base">
									category
								</span>
								{item.category}
							</span>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
