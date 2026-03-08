import { describe, expect, it } from "vitest";
import {
	canWriteRelationType,
	getWritePermissionsForType,
} from "../app/lib/relationships/permissions.server";

describe("Relationship permissions", () => {
	it("should expose explicit message write permissions", () => {
		expect(getWritePermissionsForType("message")).toContain("messages:write");
		expect(getWritePermissionsForType("message")).toContain("messages:update");
		expect(getWritePermissionsForType("message")).toContain("messages:delete");
	});

	it("should allow committee email users to manage message relations", () => {
		expect(canWriteRelationType(["committee:email"], "message")).toBe(true);
	});

	it("should allow explicit message RBACs to manage message relations", () => {
		expect(canWriteRelationType(["messages:update"], "message")).toBe(true);
	});
});
