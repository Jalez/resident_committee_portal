import { describe, expect, it } from "vitest";
import {
	buildSignature,
	ensureSignedHtmlBody,
	plaintextToHtml,
} from "~/lib/mail-draft-body.server";

describe("mail draft body helpers", () => {
	it("builds signature from name", () => {
		expect(buildSignature("Test User", "Regards")).toBe("Regards\nTest User");
	});

	it("converts plain text to html", () => {
		expect(plaintextToHtml("hello\nworld")).toContain("<br>");
	});

	it("adds signature once", () => {
		const body = "<p>Hello</p>";
		const signed = ensureSignedHtmlBody(body, "Test User", "Regards");
		const signedAgain = ensureSignedHtmlBody(signed, "Test User", "Regards");
		expect(signed).toContain("Regards");
		expect(signedAgain).toBe(signed);
	});
});
