import "dotenv/config";
import jwt from "jsonwebtoken";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = (
	process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
).replace(/\\n/g, "\n");
const RECEIVER_URL = process.env.RISC_RECEIVER_URL;

const EVENT_TYPES = [
	"https://schemas.openid.net/secevent/risc/event-type/account-disabled",
	"https://schemas.openid.net/secevent/risc/event-type/account-enabled",
	"https://schemas.openid.net/secevent/risc/event-type/sessions-revoked",
	"https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked",
	"https://schemas.openid.net/secevent/risc/event-type/verification",
];

async function generateAuthToken() {
	if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
		throw new Error("Missing service account credentials");
	}

	const now = Math.floor(Date.now() / 1000);
	const payload = {
		iss: SERVICE_ACCOUNT_EMAIL,
		sub: SERVICE_ACCOUNT_EMAIL,
		aud: "https://risc.googleapis.com/google.identity.risc.v1beta.RiscManagementService",
		iat: now,
		exp: now + 3600,
	};

	return jwt.sign(payload, SERVICE_ACCOUNT_PRIVATE_KEY, { algorithm: "RS256" });
}

async function registerReceiver() {
	if (!RECEIVER_URL) {
		console.error("❌ RISC_RECEIVER_URL is not set in .env");
		process.exit(1);
	}

	console.log(`Connecting to RISC API for: ${SERVICE_ACCOUNT_EMAIL}`);
	console.log(`Registering endpoint: ${RECEIVER_URL}`);

	try {
		const authToken = await generateAuthToken();

		const response = await fetch(
			"https://risc.googleapis.com/v1beta/stream:update",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${authToken}`,
				},
				body: JSON.stringify({
					delivery: {
						delivery_method:
							"https://schemas.openid.net/secevent/risc/delivery-method/push",
						url: RECEIVER_URL,
					},
					events_requested: EVENT_TYPES,
				}),
			},
		);

		if (!response.ok) {
			const error = await response.text();
			console.error("❌ Failed to register receiver:", error);
			process.exit(1);
		}

		console.log("✅ RISC receiver registered successfully!");
		console.log("Next step: Use scripts/verify-risc.ts to test the endpoint.");
	} catch (error) {
		console.error("❌ Error registering receiver:", error);
		process.exit(1);
	}
}

registerReceiver();
