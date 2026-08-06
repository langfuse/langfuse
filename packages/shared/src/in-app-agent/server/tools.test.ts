import { describe, expect, it } from "vitest";

import { createInAppAgentToolPolicy } from "./tools";

describe("createInAppAgentToolPolicy", () => {
  // Grants are stored on the conversation and rebuilt into a policy on every
  // run. A tool the owner's role no longer covers must fall out of both sets,
  // not just out of what the model can see.
  it("drops a stored grant the user's role no longer covers", () => {
    const grants = ["createModel"];

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

  it("ignores grants naming tools that are not in the registry", () => {
    const policy = createInAppAgentToolPolicy({
      userAccess: { projectRole: "OWNER", isAdmin: false },
      additionalAutoApproved: ["aToolThatWasDeleted"],
    });

    expect([...policy.autoApproved]).not.toContain("aToolThatWasDeleted");
  });
});
