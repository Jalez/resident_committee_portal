/**
 * Centralized environment variable validation and status reporting
 * Used to provide helpful feedback to first-time users setting up the app
 */

export interface EnvVariable {
	name: string;
	description: string;
	descriptionFi: string;
	required: boolean;
	isSet: boolean;
	helpLink?: string;
	helpText?: string;
}

export interface EnvCategory {
	name: string;
	nameFi: string;
	description: string;
	descriptionFi: string;
	icon: string;
	variables: EnvVariable[];
	isFullyConfigured: boolean;
	configuredCount: number;
	totalCount: number;
}

export interface EnvStatus {
	categories: EnvCategory[];
	canStart: boolean;
	missingCritical: string[];
	totalConfigured: number;
	totalVariables: number;
}

// Check if an env variable is set (non-empty string)
function isSet(name: string): boolean {
	const value = process.env[name];
	return typeof value === "string" && value.trim() !== "";
}

/**
 * Get the current status of all environment variables
 * Grouped by feature category with setup instructions
 */
export function getEnvStatus(): EnvStatus {
	const categories: EnvCategory[] = [
		{
			name: "Database",
			nameFi: "Tietokanta",
			description: "PostgreSQL database connection",
			descriptionFi: "PostgreSQL-tietokantayhteys",
			icon: "database",
			variables: [
				{
					name: "DATABASE_URL",
					description: "PostgreSQL connection string",
					descriptionFi: "PostgreSQL-yhteysmerkkijono",
					required: true,
					isSet: isSet("DATABASE_URL"),
					helpLink: "https://neon.tech/docs/connect/connect-from-any-app",
					helpText:
						"Local: postgres://user:password@localhost:5432/portal | Neon: postgres://user:password@ep-xxx.region.neon.tech/database?sslmode=require",
				},
				{
					name: "DATABASE_PROVIDER",
					description: "Database provider (postgres or neon)",
					descriptionFi: "Tietokantapalveluntarjoaja (postgres tai neon)",
					required: false,
					isSet: isSet("DATABASE_PROVIDER"),
					helpText:
						"Optional. Defaults to 'postgres' in development, 'neon' in production.",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
		{
			name: "Authentication",
			nameFi: "Tunnistautuminen",
			description: "Google OAuth for user login",
			descriptionFi: "Google OAuth käyttäjien kirjautumiseen",
			icon: "lock",
			variables: [
				{
					name: "GOOGLE_OAUTH_CLIENT_ID",
					description: "Google OAuth 2.0 Client ID",
					descriptionFi: "Google OAuth 2.0 Client ID",
					required: true,
					isSet: isSet("GOOGLE_OAUTH_CLIENT_ID"),
					helpLink: "https://console.cloud.google.com/apis/credentials",
					helpText:
						"Create OAuth 2.0 credentials in Google Cloud Console → APIs & Services → Credentials",
				},
				{
					name: "GOOGLE_OAUTH_CLIENT_SECRET",
					description: "Google OAuth 2.0 Client Secret",
					descriptionFi: "Google OAuth 2.0 Client Secret",
					required: true,
					isSet: isSet("GOOGLE_OAUTH_CLIENT_SECRET"),
					helpLink: "https://console.cloud.google.com/apis/credentials",
				},
				{
					name: "ADMIN_EMAIL",
					description: "Super admin email address",
					descriptionFi: "Pääkäyttäjän sähköpostiosoite",
					required: true,
					isSet: isSet("ADMIN_EMAIL"),
					helpText: "The email that will have full admin access to the system.",
				},
				{
					name: "SESSION_SECRET",
					description: "Secret for signing session cookies",
					descriptionFi: "Salaisuus istuntoevästeiden allekirjoitukseen",
					required: true,
					isSet: isSet("SESSION_SECRET"),
					helpText: "Generate with: openssl rand -base64 32",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
		{
			name: "Google APIs",
			nameFi: "Google-rajapinnat",
			description: "Calendar and Drive integration",
			descriptionFi: "Kalenteri- ja Drive-integraatio",
			icon: "calendar_month",
			variables: [
				{
					name: "GOOGLE_API_KEY",
					description: "Google API Key for public data access",
					descriptionFi: "Google API-avain julkisen datan lukemiseen",
					required: false,
					isSet: isSet("GOOGLE_API_KEY"),
					helpLink: "https://console.cloud.google.com/apis/credentials",
					helpText:
						"Enable Calendar API and Drive API in Google Cloud Console.",
				},
				{
					name: "GOOGLE_CALENDAR_ID",
					description: "Public calendar ID for events",
					descriptionFi: "Julkisen kalenterin ID tapahtumille",
					required: false,
					isSet: isSet("GOOGLE_CALENDAR_ID"),
					helpText:
						"The calendar ID from Google Calendar (e.g., your-org@gmail.com).",
				},
				{
					name: "GOOGLE_DRIVE_PUBLIC_ROOT_ID",
					description: "Public Drive folder for documents",
					descriptionFi: "Julkinen Drive-kansio asiakirjoille",
					required: false,
					isSet: isSet("GOOGLE_DRIVE_PUBLIC_ROOT_ID"),
					helpText:
						"The folder ID from the URL: drive.google.com/drive/folders/{ID}",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
		{
			name: "Google Service Account",
			nameFi: "Google-palvelutili",
			description: "For writing to Google Drive",
			descriptionFi: "Google Driveen kirjoittamista varten",
			icon: "settings",
			variables: [
				{
					name: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
					description: "Service account email",
					descriptionFi: "Palvelutilin sähköpostiosoite",
					required: false,
					isSet: isSet("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
					helpLink:
						"https://console.cloud.google.com/iam-admin/serviceaccounts",
					helpText:
						"Create a service account and share your Drive folders with this email.",
				},
				{
					name: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
					description: "Service account private key",
					descriptionFi: "Palvelutilin yksityinen avain",
					required: false,
					isSet: isSet("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
					helpText:
						"From the service account JSON file. Replace newlines with \\n",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
		{
			name: "Email (Resend)",
			nameFi: "Sähköposti (Resend)",
			description: "For sending reimbursement requests",
			descriptionFi: "Kulukorvauspyyntöjen lähettämiseen",
			icon: "mail",
			variables: [
				{
					name: "RESEND_API_KEY",
					description: "Resend API key",
					descriptionFi: "Resend API-avain",
					required: false,
					isSet: isSet("RESEND_API_KEY"),
					helpLink: "https://resend.com/api-keys",
					helpText:
						"Create at resend.com/api-keys. Use 'Full Access' for inbound email support.",
				},
				{
					name: "SENDER_EMAIL",
					description: "Email address to send from",
					descriptionFi: "Lähettäjän sähköpostiosoite",
					required: false,
					isSet: isSet("SENDER_EMAIL"),
					helpText:
						"Must be verified in Resend, or use 'onboarding@resend.dev' for testing.",
				},
				{
					name: "RECIPIENT_EMAIL",
					description: "Email to receive reimbursement requests",
					descriptionFi: "Sähköposti kulukorvauspyyntöjen vastaanottamiseen",
					required: false,
					isSet: isSet("RECIPIENT_EMAIL"),
					helpText: "The building owner or treasurer email address.",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
		{
			name: "Inbound Email (Optional)",
			nameFi: "Saapuva sähköposti (Valinnainen)",
			description: "Automatic reply handling",
			descriptionFi: "Automaattinen vastausten käsittely",
			icon: "inbox",
			variables: [
				{
					name: "RESEND_INBOUND_EMAIL",
					description: "Resend receiving address",
					descriptionFi: "Resend-vastaanotto-osoite",
					required: false,
					isSet: isSet("RESEND_INBOUND_EMAIL"),
					helpText:
						"Your Resend receiving address (e.g., anything@your-id.resend.app).",
				},
				{
					name: "RESEND_WEBHOOK_SECRET",
					description: "Webhook signing secret",
					descriptionFi: "Webhook-allekirjoitussalaisuus",
					required: false,
					isSet: isSet("RESEND_WEBHOOK_SECRET"),
					helpText:
						"From Resend dashboard webhook settings (starts with 'whsec_').",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
		{
			name: "Site Configuration",
			nameFi: "Sivuston asetukset",
			description: "Customize site name and branding",
			descriptionFi: "Mukauta sivuston nimeä ja brändiä",
			icon: "tune",
			variables: [
				{
					name: "SITE_NAME",
					description: "Name of your resident committee",
					descriptionFi: "Asukastoimikuntasi nimi",
					required: false,
					isSet: isSet("SITE_NAME"),
					helpText:
						"Shown in page titles and header. Defaults to 'Resident Committee'.",
				},
				{
					name: "SITE_SHORT_NAME",
					description: "Short name for header",
					descriptionFi: "Lyhyt nimi otsikkoon",
					required: false,
					isSet: isSet("SITE_SHORT_NAME"),
					helpText: "Optional. Uses SITE_NAME if not set.",
				},
				{
					name: "SITE_DESCRIPTION",
					description: "SEO meta description",
					descriptionFi: "SEO-metakuvaus",
					required: false,
					isSet: isSet("SITE_DESCRIPTION"),
					helpText: "Used in meta tags. Defaults to 'Tenant Committee Portal'.",
				},
			],
			isFullyConfigured: false,
			configuredCount: 0,
			totalCount: 0,
		},
	];

	// Calculate stats for each category
	let totalConfigured = 0;
	let totalVariables = 0;
	const missingCritical: string[] = [];

	for (const category of categories) {
		category.totalCount = category.variables.length;
		category.configuredCount = category.variables.filter((v) => v.isSet).length;
		category.isFullyConfigured =
			category.configuredCount === category.totalCount;

		totalConfigured += category.configuredCount;
		totalVariables += category.totalCount;

		// Track missing critical variables
		for (const variable of category.variables) {
			if (variable.required && !variable.isSet) {
				missingCritical.push(variable.name);
			}
		}
	}

	// App can start if DATABASE_URL and SESSION_SECRET are set
	const canStart = isSet("DATABASE_URL") && isSet("SESSION_SECRET");

	return {
		categories,
		canStart,
		missingCritical,
		totalConfigured,
		totalVariables,
	};
}

/**
 * Check if the app is properly configured to start
 * Used to detect first-time setup scenarios
 */
export function isAppConfigured(): boolean {
	return isSet("DATABASE_URL");
}

/**
 * Get a simple status message for debugging
 */
export function getConfigSummary(): string {
	const status = getEnvStatus();
	return `Environment: ${status.totalConfigured}/${status.totalVariables} configured. Can start: ${status.canStart}. Missing critical: ${status.missingCritical.join(", ") || "none"}`;
}
