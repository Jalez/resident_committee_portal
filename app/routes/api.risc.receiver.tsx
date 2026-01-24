import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { ActionFunctionArgs } from "react-router";

const ISSUER = "https://accounts.google.com";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

const client = jwksClient({
	jwksUri: JWKS_URI,
	cache: true,
	rateLimit: true,
});

async function getKey(header: jwt.JwtHeader): Promise<string> {
	const key = await client.getSigningKey(header.kid);
	return key.getPublicKey();
}

interface RiscDetails {
	state?: string;
	subject?: {
		sub: string;
	};
}

interface RiscPayload extends jwt.JwtPayload {
	events?: Record<string, RiscDetails>;
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	const body = await request.text();
	const token = body; // Google sends the JWT as the raw body

	if (!token) {
		return new Response(JSON.stringify({ error: "Missing token" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		// Decode without verification first to get the audience
		const decodedToken = jwt.decode(token, { complete: true });
		if (!decodedToken || typeof decodedToken === "string") {
			throw new Error("Invalid token format");
		}

		const _kid = decodedToken.header.kid;
		const publicKey = await getKey(decodedToken.header);

		const clientIdsStr =
			process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
		const clientIds = clientIdsStr
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);

		if (clientIds.length === 0) {
			console.error(
				"❌ Neither GOOGLE_CLIENT_IDS nor GOOGLE_OAUTH_CLIENT_ID is configured in .env",
			);
			return new Response(
				JSON.stringify({ error: "Internal configuration error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Verify the token
		const verified = jwt.verify(token, publicKey, {
			issuer: ISSUER,
			audience:
				clientIds.length === 1
					? clientIds[0]
					: (clientIds as [string, ...string[]]),
			// RISC tokens don't expire in the traditional sense, but we can check iat if needed
			// However, RISC spec says not to check 'exp'
			ignoreExpiration: true,
		});

		console.log(
			"🔒 RISC Security Event Received:",
			JSON.stringify(verified, null, 2),
		);

		// Handle specific events
		const events = (verified as RiscPayload).events || {};
		for (const [eventType, details] of Object.entries(events)) {
			console.log(`[RISC] Event Type: ${eventType}`, details);

			// Example handling for verification event
			if (
				eventType ===
				"https://schemas.openid.net/secevent/risc/event-type/verification"
			) {
				console.log("✅ RISC verification successful. State:", details.state);
			}

			// TODO: Add specific handling for account-disabled, sessions-revoked, etc.
			// if (eventType === "https://schemas.openid.net/secevent/risc/event-type/account-disabled") {
			//     const sub = (details as any).subject?.sub;
			//     // Handle session revocation or account locking here
			// }
		}

		// Return 202 Accepted as required by RISC spec
		return new Response(JSON.stringify({ status: "accepted" }), {
			status: 202,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("❌ RISC Token Validation Failed:", message);
		return new Response(JSON.stringify({ error: "Invalid token", message }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
}

// Optional: GET request just to verify the endpoint is alive
export async function loader() {
	return new Response(JSON.stringify({ status: "alive" }), {
		headers: { "Content-Type": "application/json" },
	});
}
