/**
 * Google Document AI integration for PDF OCR
 * Handles both images and PDFs
 */
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { getGoogleCloudCredentials } from "./google-cloud-credentials.server";

// Module-level client instance
let client: DocumentProcessorServiceClient | null = null;

/**
 * Initialize the Document AI client
 */
function getClient(): DocumentProcessorServiceClient {
	if (!client) {
		const location = process.env.DOCUMENT_AI_LOCATION || "us";

		const credentials = getGoogleCloudCredentials();
		const projectId = credentials.projectId;

		// Map locations to their regional endpoints
		const endpointMap: Record<string, string> = {
			us: "documentai.googleapis.com",
			eu: "eu-documentai.googleapis.com",
		};

		const endpoint = endpointMap[location];
		const apiEndpoint = endpoint || "documentai.googleapis.com";

		if (endpoint) {
			console.log(`[Document AI] Client configured for ${location} region: ${apiEndpoint}`);
		}

		client = new DocumentProcessorServiceClient({
			projectId: credentials.projectId,
			credentials: credentials.credentials,
			apiEndpoint,
		});
	}
	return client;
}

/**
 * Extract text from PDF using Document AI
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string | null> {
	try {
		console.log("[Document AI] Processing PDF, size:", pdfBuffer.length, "bytes");

		const docAIClient = getClient();
		const credentials = getGoogleCloudCredentials();
		const projectId = credentials.projectId;
		const location = process.env.DOCUMENT_AI_LOCATION || "us";
		const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

		if (!processorId) {
			console.error(
				"[Document AI] Configuration incomplete. Please set DOCUMENT_AI_PROCESSOR_ID in .env"
			);
			return null;
		}

		// The full resource name of the processor
		const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

		// Convert to base64
		const encodedContent = pdfBuffer.toString("base64");

		const request = {
			name,
			rawDocument: {
				content: encodedContent,
				mimeType: "application/pdf",
			},
		};

		// Process the document
		const [result] = await docAIClient.processDocument(request);
		const { document } = result;

		if (!document) {
			console.error("[Document AI] No document returned from Document AI");
			return null;
		}

		// Extract text
		const extractedText = document.text || "";

		console.log("[Document AI] Extracted text length:", extractedText.length);
		return extractedText.trim();
	} catch (error) {
		console.error("[Document AI] Request failed:", error);
		return null;
	}
}

/**
 * Extract text from image using Document AI
 * Alternative to Vision API for images
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<string | null> {
	try {
		console.log("[Document AI] Processing image, size:", imageBuffer.length, "bytes");

		const docAIClient = getClient();
		const credentials = getGoogleCloudCredentials();
		const projectId = credentials.projectId;
		const location = process.env.DOCUMENT_AI_LOCATION || "us";
		const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

		if (!processorId) {
			console.error(
				"[Document AI] Configuration incomplete. Please set DOCUMENT_AI_PROCESSOR_ID in .env"
			);
			return null;
		}

		const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

		const encodedContent = imageBuffer.toString("base64");

		const request = {
			name,
			rawDocument: {
				content: encodedContent,
				mimeType: "image/jpeg",
			},
		};

		const [result] = await docAIClient.processDocument(request);
		const { document } = result;

		if (!document) {
			console.error("[Document AI] No document returned from Document AI");
			return null;
		}

		const extractedText = document.text || "";

		console.log("[Document AI] Extracted text length:", extractedText.length);
		return extractedText.trim();
	} catch (error) {
		console.error("[Document AI] Request failed:", error);
		return null;
	}
}
