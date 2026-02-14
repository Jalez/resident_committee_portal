import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

const LINK_CLASS =
	"inline-flex items-center gap-1 text-sm text-primary hover:underline";
const ICON_CLASS = "material-symbols-outlined text-base";

interface TreasuryActionCellProps {
	viewTo?: string;
	viewTitle?: string;
	editTo?: string;
	editTitle?: string;
	canEdit?: boolean;
	copyProps?: {
		onClick: () => void;
		title: string;
	};
	deleteProps?: {
		action?: string;
		hiddenFields: Record<string, string>;
		confirmMessage: string;
		title: string;
	};
}

export function TreasuryActionCell({
	viewTo,
	viewTitle = "View",
	editTo,
	editTitle = "Edit",
	canEdit,
	copyProps,
	deleteProps,
}: TreasuryActionCellProps) {
	const deleteFetcher = useFetcher();
	const revalidator = useRevalidator();
	const { t } = useTranslation();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const deleteProcessedRef = useRef(false);

	// Revalidate when delete succeeds and show toast notifications
	useEffect(() => {
		if (
			deleteFetcher.state === "idle" &&
			deleteFetcher.data &&
			!deleteProcessedRef.current
		) {
			deleteProcessedRef.current = true;
			if (deleteFetcher.data.success) {
				toast.success(t("common.actions.deleted", "Deleted successfully"));
				setShowDeleteConfirm(false);
				revalidator.revalidate();
			} else if (deleteFetcher.data.error) {
				toast.error(deleteFetcher.data.error);
			}
		}
	}, [deleteFetcher.state, deleteFetcher.data, revalidator, t]);

	const doDelete = () => {
		if (!deleteProps) return;
		deleteProcessedRef.current = false;
		deleteFetcher.submit(deleteProps.hiddenFields, {
			method: "DELETE",
			action: deleteProps.action,
		});
	};

	return (
		<div className="flex items-center gap-1">
			{viewTo && (
				<Link to={viewTo} className={LINK_CLASS} title={viewTitle}>
					<span className={ICON_CLASS}>visibility</span>
				</Link>
			)}
			{editTo && canEdit && (
				<Link to={editTo} className={LINK_CLASS} title={editTitle}>
					<span className={ICON_CLASS}>edit</span>
				</Link>
			)}
			{copyProps && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={copyProps.onClick}
					className="text-primary hover:text-primary/80 h-8 w-8"
					title={copyProps.title}
				>
					<span className={ICON_CLASS}>content_copy</span>
				</Button>
			)}
			{deleteProps && (
				<>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => setShowDeleteConfirm(true)}
						disabled={deleteFetcher.state !== "idle"}
						className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 h-8 w-8"
						title={deleteProps.title}
					>
						<span className={ICON_CLASS}>delete</span>
					</Button>
					<ConfirmDialog
						open={showDeleteConfirm}
						onOpenChange={setShowDeleteConfirm}
						title={deleteProps.title}
						description={deleteProps.confirmMessage}
						confirmLabel={t("common.actions.delete")}
						cancelLabel={t("common.actions.cancel")}
						variant="destructive"
						onConfirm={doDelete}
						loading={deleteFetcher.state !== "idle"}
					/>
				</>
			)}
		</div>
	);
}
