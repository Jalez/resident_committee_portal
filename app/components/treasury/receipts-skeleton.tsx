import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";

function ReceiptsLoadingSpinner() {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col items-center justify-center gap-4 py-16">
			<span
				className="material-symbols-outlined text-5xl text-primary animate-spin"
				aria-hidden
			>
				progress_activity
			</span>
			<p className="text-sm font-medium text-muted-foreground">
				{t("common.actions.loading", { defaultValue: "Loading..." })}
			</p>
		</div>
	);
}

export function ReceiptsGridSkeletonOnly() {
	return <ReceiptsLoadingSpinner />;
}

/**
 * Full receipts page loading (header + spinner). Shown when navigating to /treasury/receipts
 * so the user sees a loading state before the loader completes.
 */
export function ReceiptsPageSkeleton() {
	const { t } = useTranslation();
	return (
		<PageWrapper>
			<div className="w-full max-w-5xl mx-auto px-4">
				<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<Link
							to="/treasury"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-2"
						>
							<span className="material-symbols-outlined text-base">
								arrow_back
							</span>
							{t("common.actions.back")}
						</Link>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("treasury.receipts.title")}
						</h1>
					</div>
				</div>
				<ReceiptsLoadingSpinner />
			</div>
		</PageWrapper>
	);
}
