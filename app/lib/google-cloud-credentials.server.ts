/**
 * Google Cloud credentials configuration
 * Uses existing service account credentials from GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 */
export function getGoogleCloudCredentials() {
	// Extract project ID from service account email
	// Format: project-name@project-id.iam.gserviceaccount.com
	const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
	const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

	if (!serviceAccountEmail || !privateKey) {
		throw new Error(
			"GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variables are required",
		);
	}

	// Extract project ID from email
	// Format: name@project-id.iam.gserviceaccount.com
	const projectId = serviceAccountEmail.split("@")[1]?.split(".")[0];

	if (!projectId) {
		throw new Error(
			"Could not extract project ID from GOOGLE_SERVICE_ACCOUNT_EMAIL. Expected format: name@project-id.iam.gserviceaccount.com",
		);
	}

	return {
		projectId,
		credentials: {
			client_email: serviceAccountEmail,
			private_key: privateKey.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n"),
		},
	};
}
