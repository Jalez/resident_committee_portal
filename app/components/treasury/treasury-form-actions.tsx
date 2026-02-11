import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher, useNavigate, useNavigation } from "react-router";

import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Separator } from "~/components/ui/separator";
import { useNavigationStack } from "~/contexts/navigation-stack-context";

type TreasuryFormActionsProps = {
	/** Show the save button (default: true) */
	showSave?: boolean;
	/** Custom save label (defaults to t("common.actions.save")) */
	saveLabel?: string;
	/** Show the delete button */
	showDelete?: boolean;
	/** Delete confirmation title */
	deleteTitle?: string;
	/** Delete confirmation description */
	deleteDescription?: string;
	/** Additional action buttons rendered between cancel and save */
	extraActions?: ReactNode;
	/** Whether the form is currently submitting (auto-detected from navigation if not provided) */
	isSubmitting?: boolean;
	/** Whether the submit button should be disabled */
	disabled?: boolean;
	/** Custom cancel handler (defaults to nav stack pop or navigate(-1)) */
	onCancel?: () => void;
	/** Custom delete action URL (submits to API) */
	deleteAction?: string;
	/** Custom delete method (defaults to DELETE if deleteAction is provided) */
	deleteMethod?: "DELETE" | "POST";
};

export function TreasuryFormActions({
	showSave = true,
	saveLabel,
	showDelete = false,
	deleteTitle,
	deleteDescription,
	extraActions,
	isSubmitting: isSubmittingProp,
	disabled,
	onCancel,
	deleteAction,
	deleteMethod,
}: TreasuryFormActionsProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const { pop } = useNavigationStack();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const deleteFormRef = useRef<HTMLFormElement>(null);
	const deleteFetcher = useFetcher();
	const isSubmitting =
		isSubmittingProp ??
		(navigation.state === "submitting" || deleteFetcher.state === "submitting");

	const handleCancel = useCallback(() => {
		if (onCancel) {
			onCancel();
			return;
		}
		const returnPath = pop();
		if (returnPath) {
			navigate(returnPath);
		} else {
			navigate(-1);
		}
	}, [onCancel, pop, navigate]);

	// Handle successful delete from fetcher
	useEffect(() => {
		if (deleteFetcher.state === "idle" && deleteFetcher.data?.success) {
			handleCancel();
		}
	}, [deleteFetcher.state, deleteFetcher.data, handleCancel]);

	const _doDelete = () => {
		if (deleteAction) {
			deleteFetcher.submit(null, {
				method: deleteMethod || "DELETE",
				action: deleteAction,
			});
		} else {
			deleteFormRef.current?.requestSubmit();
		}
		setShowDeleteConfirm(false);
	};

	return (
		<>
			<div className="flex gap-4">
				<Button
					type="button"
					variant="outline"
					onClick={handleCancel}
					className="flex-1"
				>
					{t("common.actions.cancel")}
				</Button>
				{extraActions}
				{showSave && (
					<Button
						type="submit"
						className="flex-1"
						disabled={isSubmitting || disabled}
					>
						{isSubmitting ? (
							<span className="flex items-center gap-2">
								<span className="animate-spin material-symbols-outlined text-sm">
									progress_activity
								</span>
								<span>{t("common.status.saving")}</span>
							</span>
						) : (
							saveLabel || t("common.actions.save")
						)}
					</Button>
				)}
			</div>

			{(showDelete || deleteAction) && (
				<>
					<Separator className="my-4" />
					<Form
						method={deleteMethod || (deleteAction ? "DELETE" : "POST")}
						action={deleteAction}
						className="hidden"
						ref={deleteFormRef}
					>
						{!deleteAction && (
							<input type="hidden" name="_action" value="delete" />
						)}
					</Form>
					<Button
						type="button"
						variant="destructive"
						className="w-full"
						onClick={() => setShowDeleteConfirm(true)}
					>
						<span className="material-symbols-outlined mr-2 text-sm">
							delete
						</span>
						{t("common.actions.delete")}
					</Button>
					<ConfirmDialog
						open={showDeleteConfirm}
						onOpenChange={setShowDeleteConfirm}
						title={deleteTitle || t("common.actions.delete")}
						description={
							deleteDescription || t("common.confirm.delete_description")
						}
						confirmLabel={t("common.actions.delete")}
						cancelLabel={t("common.actions.cancel")}
						variant="destructive"
						onConfirm={() => {
							deleteFormRef.current?.requestSubmit();
							setShowDeleteConfirm(false);
						}}
					/>
				</>
			)}
		</>
	);
}
