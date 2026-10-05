// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  supportAgentWorkflow,
  codingAgentWorkflow,
  langfuseAssistantWorkflow,
} from "./workflowStoryFixtures";

describe("pre-transcript workflow story parity", () => {
  it("represents coding and assistant workflows as one thread per trace", () => {
    for (const item of [...codingAgentWorkflow, ...langfuseAssistantWorkflow]) {
      expect(item.state.result.transcript?.threads).toHaveLength(1);
      expect(
        item.state.result.transcript?.threads[0]?.currentTurn.nestingLevel,
      ).toBe(0);
    }
  });
  it("preserves the original traces and turn numbers", () => {
    expect(
      [
        ...supportAgentWorkflow,
        ...codingAgentWorkflow,
        ...langfuseAssistantWorkflow,
      ].map(({ trace, turnNumber }) => [trace.id, turnNumber]),
    ).toEqual([
      ["trace-order-support-8f3a2", 1],
      ["trace-demo-research-turn", 2],
      ["trace-demo-implementation-turn", 3],
      ["trace-demo-error-analysis", 4],
    ]);
  });

  it("retains every original tool observation and its payloads", () => {
    for (const item of [
      ...supportAgentWorkflow,
      ...codingAgentWorkflow,
      ...langfuseAssistantWorkflow,
    ]) {
      if (item.state.type !== "transcript")
        throw new Error("Expected transcript fixture");
      const messages = item.state.result.transcript!.threads.flatMap(
        (thread) => thread.currentTurn.messages,
      );
      const results = messages.flatMap((message) =>
        message.parts
          .filter((part) => part.type === "tool-result")
          .map((part) => ({ observationId: message.observationId, part })),
      );
      const toolCounts: Record<string, number> = {
        "trace-order-support-8f3a2": 2,
        "trace-demo-research-turn": 19,
        "trace-demo-implementation-turn": 11,
        "trace-demo-error-analysis": 23,
      };
      const toolResults = results.filter(
        ({ observationId }) =>
          observationId.startsWith("tool-") || observationId.includes("-tool-"),
      );
      expect(toolResults).toHaveLength(toolCounts[item.trace.id]!);
      expect(
        new Set(toolResults.map(({ observationId }) => observationId)).size,
      ).toBe(toolCounts[item.trace.id]);
      for (const { part } of toolResults) {
        expect(part.output).toBeDefined();
        expect(
          messages
            .flatMap((message) => message.parts)
            .some(
              (call) =>
                call.type === "tool-call" &&
                call.toolCallId === part.toolCallId,
            ),
        ).toBe(true);
      }
    }
  });

  it("preserves support messages and full order details", () => {
    const content = JSON.stringify(supportAgentWorkflow);
    expect(content).toContain(
      "Hi, I just noticed order #LF-20481 is going to my old address.",
    );
    expect(content).toContain(
      "Your shipping address has been updated to **12 Market Street, San Francisco, CA 94105**.",
    );
    expect(content).toContain("800 Pine Street");
    expect(content).toContain("addr_7b19c2");
    expect(content).toContain("Update shipping address");
  });

  it("preserves the coding and error-analysis workflows instead of their shortened replacements", () => {
    const coding = JSON.stringify(codingAgentWorkflow);
    expect(coding).toContain(
      "Build a fictional recipe planner dashboard with a compact density option.",
    );
    expect(coding).toContain(
      "Implemented a compact density option for the fictional recipe dashboard",
    );
    expect(coding).toContain("grepika_search");
    expect(coding).toContain("RecipeDashboard.stories.tsx");
    const assistant = JSON.stringify(langfuseAssistantWorkflow);
    expect(assistant).toContain(
      "Analyze failed traces for a fictional travel assistant.",
    );
    expect(assistant).toContain("langfuse_getObservationFilterValues");
    expect(assistant).toContain("node scripts/rank-synthetic-fixes.mjs");
    expect(assistant).toContain("Add bounded retries with backoff");
  });
});
