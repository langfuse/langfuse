import {
  getInAppAgentPageContext,
  registerInAppAgentPageContext,
} from "./pageContext";

describe("in-app agent page context", () => {
  it("exposes registered context until its owner unmounts", () => {
    const unregister = registerInAppAgentPageContext(
      "project-1",
      "feature-context",
      [
        {
          description: "feature_context",
          value: '{"selectionId":"selection-1"}',
        },
      ],
    );

    expect(getInAppAgentPageContext("project-1")).toEqual([
      {
        description: "feature_context",
        value: '{"selectionId":"selection-1"}',
      },
    ]);
    expect(getInAppAgentPageContext("project-2")).toEqual([]);

    unregister();
    expect(getInAppAgentPageContext("project-1")).toEqual([]);
  });

  it("does not let stale cleanup remove newer context", () => {
    const unregisterOld = registerInAppAgentPageContext(
      "project-1",
      "feature-context",
      [{ description: "feature_context", value: "old" }],
    );
    const unregisterNew = registerInAppAgentPageContext(
      "project-1",
      "feature-context",
      [{ description: "feature_context", value: "new" }],
    );

    unregisterOld();
    expect(getInAppAgentPageContext("project-1")).toEqual([
      { description: "feature_context", value: "new" },
    ]);

    unregisterNew();
  });
});
