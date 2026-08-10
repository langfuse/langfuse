import { describe, expect, it } from "vitest";

import { createInAppAgentToolPolicy } from "./tools";

describe("createInAppAgentToolPolicy", () => {
  it("drops a stored grant the user's role no longer covers", () => {
    const grants = ["langfuse_createModel"];

    const asOwner = createInAppAgentToolPolicy({
      userAccess: { projectRole: "OWNER", isAdmin: false },
      alwaysAllowedTools: grants,
    });

    expect(asOwner.available.has("createModel")).toBe(true);
    expect(asOwner.autoApproved.has("createModel")).toBe(true);

    const asMember = createInAppAgentToolPolicy({
      userAccess: { projectRole: "MEMBER", isAdmin: false },
      alwaysAllowedTools: grants,
    });

    expect(asMember.available.has("createModel")).toBe(false);
    expect(asMember.autoApproved.has("createModel")).toBe(false);
  });
});
