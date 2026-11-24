import { TRACE_TRANSCRIPT_EVAL_COLUMN } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  buildTraceVariableMapping,
  TRACE_TRANSCRIPT_DEFAULT_JSON_SELECTOR,
} from "./traceTranscriptAssignments";

describe("buildTraceVariableMapping", () => {
  it("reads threads at each trace path and defaults unset variables", () => {
    expect(
      buildTraceVariableMapping(["input", "history", "all"], {
        history: {
          selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
          jsonSelector: "$[1].messages",
        },
        all: {
          selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
          jsonSelector: null,
        },
      }),
    ).toEqual([
      {
        templateVariable: "input",
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: TRACE_TRANSCRIPT_DEFAULT_JSON_SELECTOR,
      },
      {
        templateVariable: "history",
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: "$[1].messages",
      },
      {
        templateVariable: "all",
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: null,
      },
    ]);
  });
});
