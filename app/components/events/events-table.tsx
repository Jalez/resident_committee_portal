import { Link, type useFetcher } from "react-router";
import { RelationsColumn } from "~/components/relations-column";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import type { EventStatus, EventType } from "~/db/client";
import type { RelationBadgeData } from "~/lib/relations-column.server";

export interface EventTableRow {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	isAllDay: boolean;
	startDate: Date;
	endDate: Date | null;
	eventType: EventType;
	status: EventStatus;
}

interface EventsTableProps {
	events: EventTableRow[];
	hasActions: boolean;
	canUpdate: boolean;
	canDelete: boolean;
	deleteConfirmId: string | null;
	setDeleteConfirmId: (id: string | null) => void;
	handleDelete: (id: string) => void;
	deleteFetcher: ReturnType<typeof useFetcher>;
	currentLocale: string;
	t: (key: string) => string;
	relationsMap: Map<string, RelationBadgeData[]>;
}

export function EventsTable({
	events,
	hasActions,
	canUpdate,
	canDelete,
	deleteConfirmId,
	setDeleteConfirmId,
	handleDelete,
	deleteFetcher,
	currentLocale,
	t,
	relationsMap,
}: EventsTableProps) {
	return (
		<div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b border-border bg-muted/50">
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{t("common.fields.title")}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{t("common.fields.start_date")}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{t("common.fields.location")}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{t("events.type")}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{t("common.fields.status")}
							</th>
							<th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{t("common.relations.title")}
							</th>
							{hasActions && (
								<th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-20">
									{t("common.actions.title")}
								</th>
							)}
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{events.map((event) => (
							<tr
								key={event.id}
								className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
							>
								<td className="px-4 py-3">
									<Link
										to={`/events/${event.id}`}
										className="font-semibold text-gray-900 dark:text-white hover:text-primary"
									>
										{event.title}
									</Link>
								</td>
								<td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
									{event.startDate.toLocaleDateString(currentLocale, {
										year: "numeric",
										month: "short",
										day: "numeric",
									})}
									{!event.isAllDay && (
										<span className="text-gray-400 ml-1">
											{event.startDate.toLocaleTimeString(currentLocale, {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									)}
								</td>
								<td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
									{event.location || "-"}
								</td>
								<td className="px-4 py-3">
									<span
										className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase ${
											event.eventType === "meeting"
												? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
												: event.eventType === "private"
													? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
													: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
										}`}
									>
										{t(`events.types.${event.eventType}`)}
									</span>
								</td>
								<td className="px-4 py-3">
									<span
										className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold uppercase ${
											event.status === "draft"
												? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
												: event.status === "cancelled"
													? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
													: event.status === "completed"
														? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
														: "bg-primary/10 text-primary dark:bg-primary/20"
										}`}
									>
										{t(`events.statuses.${event.status}`)}
									</span>
								</td>
								<td className="px-4 py-3 text-center">
									<RelationsColumn relations={relationsMap.get(event.id) || []} />
								</td>
								{hasActions && (
									<td className="px-4 py-3 text-right">
										<div className="flex items-center justify-end gap-1">
											{deleteConfirmId === event.id ? (
												<>
													<Button
														variant="destructive"
														size="sm"
														onClick={() => handleDelete(event.id)}
														disabled={deleteFetcher.state !== "idle"}
													>
														{deleteFetcher.state !== "idle" ? (
															<span className="material-symbols-outlined animate-spin text-sm">
																progress_activity
															</span>
														) : (
															t("common.actions.confirm")
														)}
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() => setDeleteConfirmId(null)}
													>
														{t("common.actions.cancel")}
													</Button>
												</>
											) : (
												<>
													{canUpdate && (
														<Link
															to={`/events/${event.id}/edit`}
															className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
															title={t("common.actions.edit")}
														>
															<span className="material-symbols-outlined text-lg">
																edit
															</span>
														</Link>
													)}
													{canDelete && (
														<button
															type="button"
															onClick={() => setDeleteConfirmId(event.id)}
															className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
															title={t("common.actions.delete")}
														>
															<span className="material-symbols-outlined text-lg">
																delete
															</span>
														</button>
													)}
												</>
											)}
										</div>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{events.length === 0 && <EmptyState message={t("events.no_results")} />}
		</div>
	);
}
