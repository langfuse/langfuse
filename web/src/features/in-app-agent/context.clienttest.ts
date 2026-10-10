// @vitest-environment node

import { sanitizeInAppAgentContext } from "./context";

it("includes sanitized evaluator screen context", () => {
  const selectedSampleContext = {
    description: "selected_evaluator_sample",
    value: JSON.stringify({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      observationId: "observation-1",
      traceId: "trace-1",
      startTime: "2026-09-03T07:45:00.000Z",
      input: "strip me",
      output: "strip me",
    }),
  };
  const workbenchContext = {
    description: "evaluator_workbench",
    value: JSON.stringify({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      mode: "create",
      evaluatorType: "LLM_AS_JUDGE",
      sampleFilter: [],
      selectedObservation: {
        observationId: "observation-1",
        traceId: "trace-1",
        startTime: "2026-09-03T07:45:00.000Z",
        input: "strip me",
      },
      unknown: "strip me",
    }),
  };
  const sanitized = sanitizeInAppAgentContext(
    [selectedSampleContext, workbenchContext],
    "project-1",
  );

  expect(sanitized).toHaveLength(2);
  const selectedSample = sanitized.find(
    ({ description }) => description === "selected_evaluator_sample",
  );
  expect(JSON.parse(selectedSample?.value ?? "")).toEqual({
    evaluatorId: "evaluator-1",
    observationId: "observation-1",
    traceId: "trace-1",
    startTime: "2026-09-03T07:45:00.000Z",
  });
  const workbench = sanitized.find(
    ({ description }) => description === "evaluator_workbench",
  );
  expect(JSON.parse(workbench?.value ?? "")).toEqual({
    evaluatorId: "evaluator-1",
    mode: "create",
    evaluatorType: "LLM_AS_JUDGE",
    sampleFilter: [],
    selectedObservation: {
      observationId: "observation-1",
      traceId: "trace-1",
      startTime: "2026-09-03T07:45:00.000Z",
    },
  });
  expect(
    sanitizeInAppAgentContext(
      [
        {
          ...workbenchContext,
          value: workbenchContext.value.replace("project-1", "project-2"),
        },
      ],
      "project-1",
    ),
  ).toEqual([]);
});
