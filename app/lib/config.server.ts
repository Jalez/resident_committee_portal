/**
 * Site configuration loaded from environment variables
 * This file should only be imported on the server side
 */
export const SITE_CONFIG = {
	name: process.env.SITE_NAME || "Resident Committee",
	shortName: process.env.SITE_SHORT_NAME || "",
	description: process.env.SITE_DESCRIPTION || "Tenant Committee Portal",
} as const;

export type SiteConfig = typeof SITE_CONFIG;
