import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import {
  attachInterruptParentModelObservationId,
  parseInAppAgentInterruptEvent,
} from "./interrupts";

const parentModelObservationId = "parent-run-1-llm-3";

const interruptEvent = {
  type: EventType.CUSTOM,
  name: "on_interrupt",
  value: {
    type: "mastra_suspend",
    toolCallId: "tool-1",
    toolName: "langfuse_updateDashboardWidget",
    args: { name: "errors" },
    runId: "parent-run-1",
  },
};

describe("in-app agent interrupt parent model observation", () => {
  it("stamps and parses parentModelObservationId on an interrupt event", () => {
    const persisted = attachInterruptParentModelObservationId(
      interruptEvent,
      parentModelObservationId,
    );

    expect(parseInAppAgentInterruptEvent(persisted)).toEqual({
      type: "tool_approval_request",
      toolCallId: "tool-1",
      toolName: "langfuse_updateDashboardWidget",
      args: { name: "errors" },
      runId: "parent-run-1",
      parentModelObservationId,
    });
  });

  it("leaves non-interrupt events and missing ids unchanged", () => {
    expect(
      attachInterruptParentModelObservationId(interruptEvent, undefined),
    ).toBe(interruptEvent);
    expect(
      attachInterruptParentModelObservationId(
        { type: EventType.TOOL_CALL_START, toolCallId: "tool-1" },
        parentModelObservationId,
      ),
    ).toEqual({ type: EventType.TOOL_CALL_START, toolCallId: "tool-1" });
  });

  it("parses legacy interrupt events without a parent model observation", () => {
    expect(parseInAppAgentInterruptEvent(interruptEvent)).toEqual({
      type: "tool_approval_request",
      toolCallId: "tool-1",
      toolName: "langfuse_updateDashboardWidget",
      args: { name: "errors" },
      runId: "parent-run-1",
    });
  });
});
