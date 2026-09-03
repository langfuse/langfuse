import {
  getInAppAgentPageContext,
  registerInAppAgentPageContext,
} from "./pageContext";

describe("in-app agent page context", () => {
  it("exposes registered context until its owner unmounts", () => {
    const unregister = registerInAppAgentPageContext(
      "project-1",
      "evaluator-sample",
      [
        {
          description: "selected_evaluator_sample",
          value: '{"observationId":"observation-1"}',
        },
      ],
    );

    expect(getInAppAgentPageContext("project-1")).toEqual([
      {
        description: "selected_evaluator_sample",
        value: '{"observationId":"observation-1"}',
      },
    ]);
    expect(getInAppAgentPageContext("project-2")).toEqual([]);

    unregister();
    expect(getInAppAgentPageContext("project-1")).toEqual([]);
  });

  it("does not let stale cleanup remove newer context", () => {
    const unregisterOld = registerInAppAgentPageContext(
      "project-1",
      "evaluator-sample",
      [{ description: "selected_evaluator_sample", value: "old" }],
    );
    const unregisterNew = registerInAppAgentPageContext(
      "project-1",
      "evaluator-sample",
      [{ description: "selected_evaluator_sample", value: "new" }],
    );

    unregisterOld();
    expect(getInAppAgentPageContext("project-1")).toEqual([
      { description: "selected_evaluator_sample", value: "new" },
    ]);

    unregisterNew();
  });
});
