/**
 * Utility function to mask bank account numbers (IBANs)
 * for privacy protection when displaying to unauthorized users.
 *
 * @example
 * maskBankAccount("FI21 1234 5600 0007 85") // Returns "FI** **** **** **85"
 * maskBankAccount("FI2112345600000785")     // Returns "FI** **** **** **85"
 */
export function maskBankAccount(account: string | null | undefined): string {
    if (!account) return "—";

    // Remove all spaces for consistent processing
    const cleaned = account.replace(/\s/g, "");

    // Keep first 2 chars (country code) and last 4 chars
    if (cleaned.length <= 6) {
        // Too short to mask meaningfully, mask all but last 2
        return `${"*".repeat(Math.max(0, cleaned.length - 2))}${cleaned.slice(-2)}`;
    }

    const countryCode = cleaned.slice(0, 2);
    const lastFour = cleaned.slice(-4);
    const middleLength = cleaned.length - 6; // Exclude country code (2) and last 4

    // Format with spaces for readability (IBAN-style grouping of 4)
    const maskedMiddle = "*".repeat(middleLength);
    const fullMasked = `${countryCode}**${maskedMiddle}${lastFour}`;

    // Add spaces every 4 characters for readability
    return fullMasked.replace(/(.{4})/g, "$1 ").trim();
}
