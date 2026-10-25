import { describe, expect, it } from "vitest";

import { getEffectiveRole, isStaff } from "./staffAccess";

const admin = { admin: true };
const supportViewer = { supportViewer: true };
const regularUser = {};

describe("getEffectiveRole", () => {
  it.each([
    ["admin, not a member", admin, undefined, "OWNER"],
    ["admin, member", admin, "VIEWER", "OWNER"],
    ["support viewer, not a member", supportViewer, undefined, "VIEWER"],
    ["support viewer, member", supportViewer, "ADMIN", "ADMIN"],
    ["regular user, member", regularUser, "MEMBER", "MEMBER"],
    ["regular user, not a member", regularUser, undefined, undefined],
    ["no user", null, undefined, undefined],
  ] as const)("%s", (_, user, memberRole, expected) => {
    expect(getEffectiveRole(user, memberRole)).toBe(expected);
  });
});

describe("isStaff", () => {
  it("is true for admins and support viewers only", () => {
    expect(isStaff(admin)).toBe(true);
    expect(isStaff(supportViewer)).toBe(true);
    expect(isStaff(regularUser)).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});
