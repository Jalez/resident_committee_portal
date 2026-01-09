import { useInfoReel } from "~/contexts/info-reel-context";

/**
 * Border separator below header.
 * In info reel mode, this is just a simple line.
 * The actual progress indicator is now on the nav items themselves.
 */
export function InfoReelProgressBar() {
    return <div className="w-full h-px bg-border" />;
}


