import { describe, expect, it } from "vitest";

import {
  getInAppAgentContextualLanding,
  registerInAppAgentContextualLanding,
} from "./inAppAgentContextualLandingStore";

const landing = {
  id: "evaluator",
  title: "Configure an evaluator",
  description: "Describe the evaluator.",
  examples: [],
  instructions: "Ask for the evaluator requirements first.",
};

describe("in-app agent contextual landing store", () => {
  it("keeps projects isolated and removes registrations on cleanup", () => {
    const unregister = registerInAppAgentContextualLanding(
      "project-a",
      landing,
    );

    expect(getInAppAgentContextualLanding("project-a")).toBe(landing);
    expect(getInAppAgentContextualLanding("project-b")).toBeUndefined();

    unregister();

    expect(getInAppAgentContextualLanding("project-a")).toBeUndefined();
  });

  it("does not let stale cleanup remove a replacement", () => {
    const unregisterFirst = registerInAppAgentContextualLanding(
      "project-a",
      landing,
    );
    const replacement = { ...landing, title: "Replacement" };
    const unregisterReplacement = registerInAppAgentContextualLanding(
      "project-a",
      replacement,
    );

    unregisterFirst();

    expect(getInAppAgentContextualLanding("project-a")).toBe(replacement);
    unregisterReplacement();
  });
});
