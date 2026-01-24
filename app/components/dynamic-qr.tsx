import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { cn } from "~/lib/utils";

interface DynamicCardsProps {
	path: string;
	className?: string;
	size?: number;
}

export function DynamicQR({ path, className, size = 256 }: DynamicCardsProps) {
	const [qrValue, setQrValue] = useState("");

	useEffect(() => {
		if (path.startsWith("http")) {
			setQrValue(path);
		} else {
			setQrValue(`${window.location.origin}${path}`);
		}
	}, [path]);

	if (!qrValue) {
		return (
			<div
				className={cn(
					"bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl",
					className,
				)}
			/>
		);
	}

	return (
		<div className={cn("flex items-center justify-center", className)}>
			<QRCode
				value={qrValue}
				size={size}
				style={{ height: "auto", maxWidth: "100%", width: "100%" }}
				viewBox={`0 0 ${size} ${size}`}
			/>
		</div>
	);
}
