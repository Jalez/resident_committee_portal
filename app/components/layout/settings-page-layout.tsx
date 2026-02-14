import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";

interface SettingsPageLayoutProps {
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
}

export function SettingsPageLayout({
	title,
	description,
	children,
	className,
}: SettingsPageLayoutProps) {
	return (
		<PageWrapper className={className}>
			<div className="mb-8">
				<h1 className="text-3xl md:text-4xl font-black text-foreground">
					{title}
				</h1>
				{description && (
					<p className="text-muted-foreground mt-2">{description}</p>
				)}
			</div>
			<div className="w-full max-w-2xl space-y-6">{children}</div>
		</PageWrapper>
	);
}
