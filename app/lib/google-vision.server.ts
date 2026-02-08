/**
 * Google Cloud Vision API integration for Receipt OCR
 * Uses the API Key method for authentication (simple and suitable for Vision API)
 */

export async function extractTextFromImage(
    imageBase64: string,
): Promise<string | null> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("[Google Vision] Missing GOOGLE_API_KEY env var");
        return null;
    }

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

    try {
        console.log("[Google Vision] Sending request, image size:", imageBase64.length, "bytes");

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                requests: [
                    {
                        image: {
                            content: imageBase64,
                        },
                        features: [
                            {
                                type: "DOCUMENT_TEXT_DETECTION",
                            },
                        ],
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Google Vision] API Error ${response.status}: ${errorText}`);
            return null;
        }

        const data = await response.json();
        console.log("[Google Vision] Response:", JSON.stringify(data).substring(0, 500));

        // Check for errors in the response
        if (data.responses?.[0]?.error) {
            console.error("[Google Vision] API returned error:", data.responses[0].error);
            return null;
        }

        // DOCUMENT_TEXT_DETECTION returns fullTextAnnotation
        const fullText = data.responses?.[0]?.fullTextAnnotation?.text;

        if (fullText) {
            console.log("[Google Vision] Extracted text length:", fullText.length);
            return fullText;
        }

        // Fallback to textAnnotations for backwards compatibility
        const annotations = data.responses?.[0]?.textAnnotations;
        if (annotations && annotations.length > 0) {
            const text = annotations[0].description || null;
            console.log("[Google Vision] Extracted text length (fallback):", text?.length || 0);
            return text;
        }

        console.warn("[Google Vision] No text annotations found in response");
        return null;
    } catch (error) {
        console.error("[Google Vision] Request failed:", error);
        return null;
    }
}
