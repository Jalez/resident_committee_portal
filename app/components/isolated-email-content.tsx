import { useEffect, useRef, useState } from "react";

/**
 * Renders email HTML inside an iframe with srcdoc to fully isolate
 * email styles (including <style> tags) from the parent application.
 */
export function IsolatedEmailContent({
    html,
    className,
}: {
    html: string;
    className?: string;
}) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(150);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // Build a self-contained HTML document for the iframe
    const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: inherit;
    background: transparent;
    overflow: hidden;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  a { color: #3b82f6; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; word-break: break-word; }
  blockquote {
    margin: 0.5em 0;
    padding-left: 1em;
    border-left: 3px solid #d1d5db;
    color: #6b7280;
  }
</style>
</head>
<body>${html}</body>
</html>`;

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const updateHeight = () => {
            try {
                const doc = iframe.contentDocument;
                if (doc?.body) {
                    const newHeight = doc.body.scrollHeight;
                    if (newHeight > 0) {
                        setHeight(newHeight);
                    }
                }
            } catch {
                // Cross-origin safety
            }
        };

        const handleLoad = () => {
            updateHeight();

            // Also watch for dynamic content changes (images loading, etc.)
            try {
                const doc = iframe.contentDocument;
                if (doc?.body) {
                    resizeObserverRef.current = new ResizeObserver(() => {
                        updateHeight();
                    });
                    resizeObserverRef.current.observe(doc.body);
                }
            } catch {
                // Cross-origin safety
            }
        };

        iframe.addEventListener("load", handleLoad);

        return () => {
            iframe.removeEventListener("load", handleLoad);
            resizeObserverRef.current?.disconnect();
        };
    }, [html]);

    return (
        <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            title="Email content"
            sandbox="allow-same-origin"
            className={className}
            style={{
                width: "100%",
                height: `${height}px`,
                border: "none",
                display: "block",
                overflow: "hidden",
            }}
        />
    );
}
