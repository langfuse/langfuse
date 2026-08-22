import { buildSelectedSampleObject } from "./buildSelectedSampleObject";

describe("buildSelectedSampleObject", () => {
  it("combines an event-list row with full event data for evaluator mappings", () => {
    expect(
      buildSelectedSampleObject({
        observation: {
          id: "observation-1",
          traceId: "trace-1",
          name: "answer",
        },
        eventDetails: {
          id: "observation-1",
          input: '{"question":"Where is my order?"}',
          output: '{"answer":"It arrives tomorrow."}',
          metadata: { customerTier: "pro" },
          toolCalls: [
            '{"id":"call-1","arguments":"{\\"orderId\\":\\"123\\"}","type":"function","index":0}',
          ],
          toolCallNames: ["lookup_order"],
        },
      }),
    ).toMatchObject({
      id: "observation-1",
      traceId: "trace-1",
      name: "answer",
      input: '{"question":"Where is my order?"}',
      output: '{"answer":"It arrives tomorrow."}',
      metadata: { customerTier: "pro" },
      toolCalls: [
        {
          id: "call-1",
          name: "lookup_order",
          arguments: { orderId: "123" },
          type: "function",
          index: 0,
        },
      ],
    });
  });

  it("waits for both the selected row and its full event data", () => {
    expect(
      buildSelectedSampleObject({ observation: null, eventDetails: null }),
    ).toBeNull();
    expect(
      buildSelectedSampleObject({
        observation: { id: "observation-1" },
        eventDetails: null,
      }),
    ).toBeNull();
  });
});
