import { Link } from "react-router";
import { DynamicQR } from "~/components/dynamic-qr";
import { useInfoReel } from "~/contexts/info-reel-context";
import { useLanguage } from "~/contexts/language-context";
import {
	CONTENT_AREA_HEIGHT,
	CONTENT_AREA_WIDTH,
} from "~/lib/layout-constants";
import { cn } from "~/lib/utils";

/**
 * Wrapper for scrollable content/list areas with fixed height.
 * Use this to ensure consistent dimensions across public routes.
 * Only the list content should be wrapped - headers, nav buttons, and action buttons should be outside.
 */
interface ContentAreaProps {
	children: React.ReactNode;
	className?: string;
}

export function ContentArea({ children, className }: ContentAreaProps) {
	return (
		<div
			className={cn("overflow-y-auto overflow-x-hidden", className)}
			style={{ height: CONTENT_AREA_HEIGHT, width: CONTENT_AREA_WIDTH }}
		>
			{children}
		</div>
	);
}

interface PageWrapperProps {
	children: React.ReactNode;
	className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
	return (
		<div
			className={cn(
				"font-sans text-[#111418] dark:text-gray-100 min-h-full flex flex-col overflow-x-hidden selection:bg-primary/30",
				className,
			)}
		>
			<div className="flex-1 flex flex-col items-center justify-start">
				{children}
			</div>
		</div>
	);
}

interface PageHeaderProps {
	primary: string;
	secondary: string;
	className?: string;
}

export function PageHeader({ primary, secondary, className }: PageHeaderProps) {
	const { language, isInfoReel, secondaryLanguage } = useLanguage();

	if (isInfoReel) {
		return (
			<h1
				className={cn(
					"hidden md:block text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-8",
					className,
				)}
			>
				<span className="text-gray-900 dark:text-white">{primary}</span>
				<br />
				<span className="text-primary">{secondary}</span>
			</h1>
		);
	}

	return (
		<h1
			className={cn(
				"hidden md:block text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-8",
				className,
			)}
		>
			<span className="text-gray-900 dark:text-white">
				{language === secondaryLanguage ? secondary : primary}
			</span>
		</h1>
	);
}

interface SplitLayoutProps {
	children: React.ReactNode;
	right?: React.ReactNode;
	header?: {
		primary: string;
		secondary: string;
	};
	className?: string;
	/** Optional footer content shown below main content (e.g., action buttons) */
	footer?: React.ReactNode;
}

export function SplitLayout({
	children,
	right,
	header,
	className,
	footer,
}: SplitLayoutProps) {
	const { isInfoReel } = useInfoReel();
	const { language, secondaryLanguage } = useLanguage();

	// Info Reel mode: split layout with QR panel
	if (isInfoReel && right) {
		return (
			<div
				className={cn(
					"w-full max-w-[1200px] overflow-hidden flex flex-col lg:flex-row h-auto",
					className,
				)}
			>
				<div className="lg:w-7/12 flex flex-col p-8 lg:p-12 relative">
					{header && (
						<div
							className="animate-reel-fade-in"
							style={{ animationDelay: "0ms" }}
						>
							<PageHeader
								primary={header.primary}
								secondary={header.secondary}
							/>
						</div>
					)}
					<div
						className="animate-reel-fade-in"
						style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
					>
						{children}
					</div>
				</div>

				{/* Right Side / QR Panel Area */}
				{right}
			</div>
		);
	}

	// Regular mode: full-width content
	return (
		<div
			className={cn(
				"w-full overflow-hidden flex flex-col h-full flex-1",
				className,
			)}
		>
			<div className="flex flex-col p-2 lg:p-12 relative">
				{/* Header row with optional action button on right */}
				{/* Header row - hidden on mobile since nav shows page name */}
				{header && (
					<div className="hidden md:flex items-start justify-between gap-4 mb-8">
						<h1 className="text-4xl lg:text-5xl font-black tracking-tight leading-tight">
							{isInfoReel ? (
								<>
									<span className="text-gray-900 dark:text-white">
										{header.primary}
									</span>
									<br />
									<span className="text-primary">{header.secondary}</span>
								</>
							) : (
								<span className="text-gray-900 dark:text-white">
									{language === secondaryLanguage
										? header.secondary
										: header.primary}
								</span>
							)}
						</h1>
						{footer && <div className="shrink-0">{footer}</div>}
					</div>
				)}
				{/* Mobile: just show footer if present */}
				{footer && <div className="md:hidden mb-4">{footer}</div>}
				{/* If no header but has footer, show footer separately */}
				{!header && footer && <div className="mb-8">{footer}</div>}
				{children}
			</div>
		</div>
	);
}

interface QRPanelProps {
	qrPath?: string;
	qrUrl?: string; // For external links
	title?: React.ReactNode;
	description?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
	/** Button text for regular mode (Primary / Secondary) */
	buttonLabel?: {
		primary: string;
		secondary: string;
	};
	/** Material icon name for the button */
	buttonIcon?: string;
	/** Optional opacity for fade transitions (0-1) */
	opacity?: number;
}

export function QRPanel({
	qrPath,
	qrUrl,
	title,
	description,
	children,
	className,
	buttonLabel = { primary: "Avaa linkki", secondary: "Open Link" },
	buttonIcon = "open_in_new",
	opacity = 1,
}: QRPanelProps) {
	const path = qrPath || qrUrl || "/";
	const isExternal = !!qrUrl;
	const { isInfoReel } = useInfoReel();
	const { language, secondaryLanguage } = useLanguage();

	return (
		<div
			className={cn(
				"lg:w-5/12 p-8 lg:p-12 flex flex-col items-center justify-start text-center",
				isInfoReel && "animate-reel-fade-in",
				className,
			)}
			style={
				isInfoReel
					? { animationDelay: "400ms", animationFillMode: "backwards", opacity }
					: undefined
			}
		>
			<div className="flex flex-col items-center max-w-sm mx-auto w-full">
				{/* Title - Only visible in Info Reel mode with QR */}
				{isInfoReel && title && <div className="mb-6">{title}</div>}

				{/* QR Code - Only visible in Info Reel mode */}
				{isInfoReel && (
					<div className="mb-0 p-4 bg-white rounded-3xl dark:bg-white/5 w-full max-w-full mx-auto aspect-square min-w-[100px]">
						<DynamicQR path={path} className="w-full h-full" />
					</div>
				)}

				{/* Prominent Action Button - Only visible in regular mode */}
				{!isInfoReel &&
					(isExternal ? (
						<Link
							to={qrUrl}
							className="group flex flex-row items-center justify-center p-4  bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-3xl text-white shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-300"
						>
							<span className="material-symbols-outlined text-6xl group-hover:scale-110 transition-transform">
								{buttonIcon}
							</span>
							<div className="flex flex-col items-start">
								<span className="text-2xl font-black tracking-tight">
									{language === secondaryLanguage
										? buttonLabel.secondary
										: buttonLabel.primary}
								</span>
							</div>
						</Link>
					) : (
						<Link
							to={path}
							className="group flex flex-col items-center justify-center w-full px-8 py-10 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-3xl text-white shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-300"
						>
							<span className="material-symbols-outlined text-5xl mb-3 group-hover:scale-110 transition-transform">
								{buttonIcon}
							</span>
							<span className="text-2xl font-black tracking-tight">
								{language === secondaryLanguage
									? buttonLabel.secondary
									: buttonLabel.primary}
							</span>
						</Link>
					))}

				{description && <div className="mt-6 mb-4">{description}</div>}

				{children}
			</div>
		</div>
	);
}

// Reusable Action Button for page footers
interface ActionButtonProps {
	href: string;
	icon: string;
	labelPrimary: string;
	labelSecondary: string;
	external?: boolean;
	className?: string;
}

export function ActionButton({
	href,
	icon,
	labelPrimary,
	labelSecondary,
	external = true,
	className,
}: ActionButtonProps) {
	const { language, secondaryLanguage } = useLanguage();

	const ButtonContent = (
		<>
			<span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
				{icon}
			</span>
			<div className="flex flex-col items-start">
				<span className="text-sm font-black tracking-tight leading-tight">
					{language === secondaryLanguage ? labelSecondary : labelPrimary}
				</span>
			</div>
		</>
	);

	const buttonClass = cn(
		"group inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-300",
		className,
	);

	if (external) {
		return (
			<a href={href} target="_blank" rel="noreferrer" className={buttonClass}>
				{ButtonContent}
			</a>
		);
	}

	return (
		<Link to={href} className={buttonClass}>
			{ButtonContent}
		</Link>
	);
}
