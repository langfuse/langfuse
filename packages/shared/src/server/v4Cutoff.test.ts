import { describe, expect, it } from "vitest";

import { isV4CutoffActive } from "./v4Cutoff";

const active = {
  cloudRegion: "EU",
  enabled: "true",
  exemptOrgIds: ["org-exempt"],
  orgId: "org-1",
};

describe("isV4CutoffActive", () => {
  it("cuts only a non-exempt Cloud org while the switch is on", () => {
    expect(isV4CutoffActive(active)).toBe(true);
    expect(isV4CutoffActive({ ...active, enabled: "false" })).toBe(false);
    expect(isV4CutoffActive({ ...active, enabled: undefined })).toBe(false);
    expect(isV4CutoffActive({ ...active, cloudRegion: undefined })).toBe(false);
    expect(isV4CutoffActive({ ...active, orgId: "org-exempt" })).toBe(false);
  });
});
