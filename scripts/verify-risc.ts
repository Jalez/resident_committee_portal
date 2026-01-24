import "dotenv/config";
import jwt from "jsonwebtoken";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = (
	process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
).replace(/\\n/g, "\n");

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

async function verifyStream() {
	console.log(`Requesting verification token for: ${SERVICE_ACCOUNT_EMAIL}`);

	try {
		const authToken = await generateAuthToken();

		const response = await fetch(
			"https://risc.googleapis.com/v1beta/stream:verify",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${authToken}`,
				},
				body: JSON.stringify({
					state: `testing-${Math.random().toString(36).substring(7)}`,
				}),
			},
		);

		if (!response.ok) {
			const error = await response.text();
			console.error("❌ Failed to request verification:", error);
			process.exit(1);
		}

		console.log("✅ Verification token requested!");
		console.log(
			"Check your server logs for the incoming 'verification' event.",
		);
	} catch (error) {
		console.error("❌ Error requesting verification:", error);
		process.exit(1);
	}
}

verifyStream();
