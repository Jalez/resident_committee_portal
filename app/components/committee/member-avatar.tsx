import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

function getSurnameEdgeLetters(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";

	const surname = parts[parts.length - 1] || "";
	const first = surname[0]?.toUpperCase() || "?";
	const last = surname[surname.length - 1]?.toUpperCase() || first;

	return `${first}${last}`;
}

// "bg-red-500" → "red-500", "bg-primary" → "primary"
function getRoleColorName(colorClass: string): string {
	const match = colorClass.match(/^bg-(.+)$/);
	return match ? match[1] : "primary";
}

function isPngImageUrl(url: string): boolean {
	const lower = url.toLowerCase();
	if (lower.startsWith("data:image/png")) return true;
	if (lower.includes("avatar-format=png")) return true;
	if (/\.png(?:$|[?#])/.test(lower)) return true;

	try {
		const parsed = new URL(url, "http://localhost");
		const pathname = parsed.pathname.toLowerCase();
		if (pathname.endsWith(".png")) return true;
		if (
			`${parsed.search}${parsed.hash}`
				.toLowerCase()
				.includes("avatar-format=png")
		) {
			return true;
		}
		return /\.png(?:$|[?#])/.test(
			`${pathname}${parsed.search}${parsed.hash}`,
		);
	} catch {
		return /\.png(?:$|[?#])/.test(lower);
	}
}

function isGoogleProfileAvatarUrl(url: string): boolean {
	try {
		const host = new URL(url, "http://localhost").hostname.toLowerCase();
		return host === "lh3.googleusercontent.com" || host.endsWith(".googleusercontent.com");
	} catch {
		return url.toLowerCase().includes("googleusercontent.com");
	}
}

type MemberAvatarProps = {
	name: string;
	picture: string | null;
	roleColor: string;
	isInfoReel?: boolean;
};

export function MemberAvatar({
	name,
	picture,
	roleColor,
	isInfoReel = false,
}: MemberAvatarProps) {
	const [imageLoadFailed, setImageLoadFailed] = useState(false);

	useEffect(() => {
		setImageLoadFailed(false);
	}, [picture]);

	const roleColorName = getRoleColorName(roleColor);
	const hasUsablePicture =
		Boolean(picture) &&
		!imageLoadFailed &&
		!isGoogleProfileAvatarUrl(picture || "");
	const pictureUrl = hasUsablePicture ? (picture ?? undefined) : undefined;
	const useMaskedAvatar = picture ? isPngImageUrl(picture) : false;

	const avatarVars = {
		"--c": `color-mix(in oklch, var(--color-${roleColorName}) 18%, var(--card))`,
		"--cb": "var(--primary)",
	} as React.CSSProperties;

	const initialsTextClass = isInfoReel
		? "text-4xl md:text-5xl"
		: "text-3xl md:text-4xl";

	return (
		<div className="relative z-10 shrink-0">
			{hasUsablePicture && useMaskedAvatar ? (
				<div
					className={cn(
						"avatar-effect avatar-pop",
						!isInfoReel && "avatar-effect--large",
						isInfoReel && "avatar-effect--reel",
					)}
					style={avatarVars}
				>
					<img
						src={pictureUrl}
						alt={name}
						className="avatar-effect-portrait"
						onError={() => setImageLoadFailed(true)}
					/>
				</div>
			) : hasUsablePicture ? (
				<div
					className={cn(
						"avatar-effect avatar-effect--static",
						!isInfoReel && "avatar-effect--large",
						isInfoReel && "avatar-effect--reel",
					)}
					style={avatarVars}
				>
					<img
						src={pictureUrl}
						alt={name}
						className="avatar-effect-portrait avatar-effect-portrait--static"
						onError={() => setImageLoadFailed(true)}
					/>
				</div>
			) : (
				<div
					className={cn(
						"avatar-effect avatar-effect--fallback relative",
						!isInfoReel && "avatar-effect--large",
						isInfoReel && "avatar-effect--reel",
					)}
					style={avatarVars}
				>
					<span
						className={cn(
							"avatar-effect-initials font-black text-primary",
							initialsTextClass,
						)}
					>
						{getSurnameEdgeLetters(name)}
					</span>
				</div>
			)}
		</div>
	);
}
