"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

export interface MailItemProps {
	type: "message" | "draft";
	id: string;
	primaryText: string;
	secondaryText: string;
	date: string;
	preview?: string;
	href: string;
	onDelete?: (id: string) => void;
	selectable?: boolean;
	selected?: boolean;
	onSelectChange?: (selected: boolean) => void;
	/** Number of messages in the thread (shown as badge when > 1) */
	threadCount?: number;
}

export function MailItem({
	type,
	id,
	primaryText,
	secondaryText,
	date,
	preview,
	href,
	onDelete,
	selectable = false,
	selected = false,
	onSelectChange,
	threadCount,
}: MailItemProps) {
	const { t } = useTranslation();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const avatarLetter = (primaryText || secondaryText || "?")
		.slice(0, 1)
		.toUpperCase();

	const handleDeleteClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDeleteOpen(true);
	};

	const handleConfirmDelete = () => {
		onDelete?.(id);
		setDeleteOpen(false);
	};

	const handleCheckboxChange = (checked: boolean | "indeterminate") => {
		onSelectChange?.(checked === true);
	};

	return (
		<>
			<Link
				to={href}
				className={cn(
					"flex items-start gap-3 px-2 py-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
				)}
			>
				{selectable && (
					<button
						type="button"
						data-mail-item-checkbox
						className="flex shrink-0 items-center pt-0.5 bg-transparent border-0 p-0 cursor-default"
						onClick={(e) => e.stopPropagation()}
					>
						<Checkbox
							checked={selected}
							onCheckedChange={handleCheckboxChange}
							aria-label={t("mail.select")}
						/>
					</button>
				)}
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium">
					{avatarLetter}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<span className="truncate text-sm font-medium text-gray-900 dark:text-white">
							{primaryText}
							{threadCount != null && threadCount > 1 && (
								<span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-200 px-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
									{threadCount}
								</span>
							)}
						</span>
						<div className="flex items-center gap-1 shrink-0">
							<span className="text-xs text-gray-500 dark:text-gray-400">
								{date}
							</span>
							{onDelete && (
								<Button
									data-mail-item-delete
									type="button"
									variant="ghost"
									size="icon"
									className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-transparent"
									onClick={handleDeleteClick}
									aria-label={t("mail.delete")}
								>
									<Trash2 className="size-3.5" />
								</Button>
							)}
						</div>
					</div>
					<p className="truncate text-sm text-gray-600 dark:text-gray-300">
						{secondaryText}
					</p>
					{preview && (
						<p className="truncate text-sm text-gray-500 dark:text-gray-400 mt-0.5">
							{preview}
						</p>
					)}
				</div>
			</Link>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent onClick={(e) => e.stopPropagation()}>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("mail.delete")}</AlertDialogTitle>
						<AlertDialogDescription>
							{type === "draft"
								? t("mail.delete_draft_confirm")
								: t("mail.delete_confirm")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{t("common.actions.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
