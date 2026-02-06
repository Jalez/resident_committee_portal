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
                                type: "TEXT_DETECTION",
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
        const annotations = data.responses?.[0]?.textAnnotations;

        if (annotations && annotations.length > 0) {
            // fullTextAnnotation is usually the first element in textAnnotations or accessible via fullTextAnnotation field
            return data.responses[0].fullTextAnnotation?.text || annotations[0].description || null;
        }

        return null;
    } catch (error) {
        console.error("[Google Vision] Request failed:", error);
        return null;
    }
}
