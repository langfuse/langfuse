import { filterBatchForEventsOnly } from "@/src/pages/api/public/ingestion";

describe("legacy ingestion write-mode filter", () => {
  const scoreEvent = { id: "score", type: "score-create" };
  const sdkLogEvent = { id: "log", type: "sdk-log" };

  it("allows only score events in v4-only mode", () => {
    expect(filterBatchForEventsOnly([scoreEvent, sdkLogEvent], true)).toEqual({
      batchForProcessing: [scoreEvent],
      rejectedErrors: [
        expect.objectContaining({
          id: "log",
          status: 400,
          message: "Event type not accepted",
          error: expect.stringContaining("only accepts score events"),
        }),
      ],
    });
  });

  it("preserves sdk-log compatibility outside v4-only mode", () => {
    expect(filterBatchForEventsOnly([sdkLogEvent], false)).toEqual({
      batchForProcessing: [sdkLogEvent],
      rejectedErrors: [],
    });
  });
});
