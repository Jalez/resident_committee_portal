import { Form, Link } from "react-router";
import { Button } from "~/components/ui/button";

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
				<Form
					method="post"
					action={deleteProps.action}
					className="inline-block"
				>
					{Object.entries(deleteProps.hiddenFields).map(([name, value]) => (
						<input key={name} type="hidden" name={name} value={value} />
					))}
					<Button
						type="submit"
						variant="ghost"
						size="icon"
						onClick={(e) => {
							if (!confirm(deleteProps.confirmMessage)) {
								e.preventDefault();
							}
						}}
						className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 h-8 w-8"
						title={deleteProps.title}
					>
						<span className={ICON_CLASS}>delete</span>
					</Button>
				</Form>
			)}
		</div>
	);
}
