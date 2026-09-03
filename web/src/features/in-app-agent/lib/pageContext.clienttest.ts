import {
  getInAppAgentPageContext,
  registerInAppAgentPageContext,
} from "./pageContext";

describe("in-app agent page context", () => {
  it("exposes registered context until its owner unmounts", () => {
    const unregister = registerInAppAgentPageContext("evaluator-sample", [
      {
        description: "selected_evaluator_sample",
        value: '{"observationId":"observation-1"}',
      },
    ]);

    expect(getInAppAgentPageContext()).toEqual([
      {
        description: "selected_evaluator_sample",
        value: '{"observationId":"observation-1"}',
      },
    ]);

    unregister();
    expect(getInAppAgentPageContext()).toEqual([]);
  });

  it("does not let stale cleanup remove newer context", () => {
    const unregisterOld = registerInAppAgentPageContext("evaluator-sample", [
      { description: "selected_evaluator_sample", value: "old" },
    ]);
    const unregisterNew = registerInAppAgentPageContext("evaluator-sample", [
      { description: "selected_evaluator_sample", value: "new" },
    ]);

    unregisterOld();
    expect(getInAppAgentPageContext()).toEqual([
      { description: "selected_evaluator_sample", value: "new" },
    ]);

    unregisterNew();
  });
});
