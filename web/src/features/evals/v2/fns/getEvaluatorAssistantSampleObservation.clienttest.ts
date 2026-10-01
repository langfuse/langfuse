import { getEvaluatorAssistantSampleObservation } from "./getEvaluatorAssistantSampleObservation";

describe("getEvaluatorAssistantSampleObservation", () => {
  it("normalizes valid sample references", () => {
    expect(
      getEvaluatorAssistantSampleObservation({
        id: " observation-1 ",
        traceId: " trace-1 ",
        startTime: new Date("2026-09-02T07:30:00.000Z"),
      }),
    ).toEqual({
      observationId: "observation-1",
      traceId: "trace-1",
      startTime: "2026-09-02T07:30:00.000Z",
    });
  });

  it("omits malformed sample references", () => {
    expect(
      getEvaluatorAssistantSampleObservation({
        id: "",
        traceId: "trace-1",
        startTime: new Date("invalid"),
      }),
    ).toBeNull();
  });
});
