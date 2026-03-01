import { useState, useEffect } from "react";

export function useTransparentBackgroundDetection(imageUrl?: string | null): boolean | null {
    const [hasTransparentBackground, setHasTransparentBackground] = useState<boolean | null>(null);

    useEffect(() => {
        if (!imageUrl) {
            setHasTransparentBackground(null);
            return;
        }

        let isMounted = true;
        const img = new Image();

        img.crossOrigin = "anonymous";
        img.src = imageUrl;

        img.onload = () => {
            if (!isMounted) return;

            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                setHasTransparentBackground(false);
                return;
            }

            try {
                ctx.drawImage(img, 0, 0);

                // Sample standard portrait corners: 
                // The top-left and top-right corners should almost certainly be transparent 
                // if it's a cutout portrait of a person.
                const corners = [
                    { x: 0, y: 0 },                                  // top-left
                    { x: img.width - 1, y: 0 },                      // top-right
                ];

                let transparentCorners = 0;

                for (const pt of corners) {
                    const pixel = ctx.getImageData(pt.x, pt.y, 1, 1).data;
                    const alpha = pixel[3]; // 0-255

                    // Consider fully transparent or nearly transparent (< 10) as transparent
                    if (alpha < 10) {
                        transparentCorners++;
                    }
                }

                // If BOTH top corners are transparent, we're fairly confident it's a cutout.
                if (transparentCorners === 2) {
                    setHasTransparentBackground(true);
                } else {
                    setHasTransparentBackground(false);
                }

            } catch (e) {
                console.warn("Could not check image transparency (likely CORS):", e);
                setHasTransparentBackground(false); // Default to false if we can't inspect
            }
        };

        img.onerror = () => {
            if (!isMounted) return;
            setHasTransparentBackground(false);
        };

        return () => {
            isMounted = false;
        };
    }, [imageUrl]);

    return hasTransparentBackground;
}
