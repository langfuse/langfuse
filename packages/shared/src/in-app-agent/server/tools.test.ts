import { describe, expect, it } from "vitest";

import { createInAppAgentToolPolicy } from "./tools";

describe("createInAppAgentToolPolicy", () => {
  // Grants are stored on the conversation and rebuilt into a policy on every
  // run. A tool the owner's role no longer covers must fall out of both sets,
  // not just out of what the model can see.
  it("drops a stored grant the user's role no longer covers", () => {
    const grants = ["langfuse_createModel"];

    const asOwner = createInAppAgentToolPolicy({
      userAccess: { projectRole: "OWNER", isAdmin: false },
      additionalAutoApproved: grants,
    });

    expect(asOwner.available.has("createModel")).toBe(true);
    expect(asOwner.autoApproved.has("createModel")).toBe(true);

    const asMember = createInAppAgentToolPolicy({
      userAccess: { projectRole: "MEMBER", isAdmin: false },
      additionalAutoApproved: grants,
    });

    expect(asMember.available.has("createModel")).toBe(false);
    expect(asMember.autoApproved.has("createModel")).toBe(false);
  });

  // The `langfuse_` prefix is part of a grant's identity. Without it a stored
  // name could match a same-named tool on a different MCP surface, so an
  // unprefixed or foreign-prefixed entry must not authorize anything.
  it("ignores grants that are unprefixed, foreign, or not in the registry", () => {
    const policy = createInAppAgentToolPolicy({
      userAccess: { projectRole: "OWNER", isAdmin: false },
      additionalAutoApproved: [
        "createModel",
        "someOtherServer_createModel",
        "langfuse_aToolThatWasDeleted",
      ],
    });

    expect(policy.autoApproved.has("createModel")).toBe(false);
  });
});
