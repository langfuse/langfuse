import { describe, expect, it } from "vitest";

import { extractTranscriptEvalVariables } from "./traceTranscriptEval";

describe("extractTranscriptEvalVariables", () => {
  it("resolves paths on per-thread messages from the stored transcript", () => {
    const storedThreads = [
      {
        conversationHistory: [
          {
            role: "user",
            parts: [{ type: "text", text: "hi" }],
            source: "input",
          },
        ],
        currentTurn: {
          nestingLevel: 0,
          observations: [{ id: "obs-1", traceId: "trace-1" }],
          messages: [
            {
              role: "assistant",
              parts: [{ type: "text", text: "hello" }],
              source: "output",
              observationId: "obs-1",
              traceId: "trace-1",
              startTime: new Date("2026-01-01T00:00:00Z"),
              endTime: null,
            },
          ],
        },
      },
    ];

    const result = extractTranscriptEvalVariables(storedThreads, [
      {
        templateVariable: "reply",
        selectedColumnId: "threads",
        jsonSelector: "$[0].messages[1].parts[0].text",
      },
      { templateVariable: "threads", selectedColumnId: "threads" },
    ]);

    expect(result).toEqual({
      ok: true,
      variables: [
        { var: "reply", value: "hello" },
        {
          var: "threads",
          value: [
            {
              messages: [
                {
                  role: "user",
                  parts: [{ type: "text", text: "hi" }],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [{ type: "text", text: "hello" }],
                  source: "output",
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
