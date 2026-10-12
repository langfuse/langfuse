import { describe, expect, it, vi } from "vitest";

import {
  getLatestInAppAgentToolResult,
  publishInAppAgentToolResult,
  subscribeToInAppAgentToolResults,
  type InAppAgentToolResult,
} from "./inAppAgentToolResultSubscriptions";

const result = {
  projectId: "project-a",
  conversationId: "conversation-a",
  toolCallId: "tool-call-a",
  toolName: "langfuse_testEvaluator",
  toolArguments: { evaluatorId: "evaluator-a" },
  toolResultContent: '{"success":true}',
} satisfies InAppAgentToolResult;

describe("in-app agent tool result subscriptions", () => {
  it("delivers results only to subscribers in the same project", () => {
    const projectAListener = vi.fn();
    const projectBListener = vi.fn();
    const unsubscribeA = subscribeToInAppAgentToolResults(
      "project-a",
      projectAListener,
    );
    const unsubscribeB = subscribeToInAppAgentToolResults(
      "project-b",
      projectBListener,
    );

    publishInAppAgentToolResult(result);

    expect(projectAListener).toHaveBeenCalledOnce();
    expect(projectAListener).toHaveBeenCalledWith(result);
    expect(projectBListener).not.toHaveBeenCalled();

    unsubscribeA();
    unsubscribeB();
  });

  it("stops delivering results after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInAppAgentToolResults("project-a", listener);

    unsubscribe();
    publishInAppAgentToolResult(result);

    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates subscribers from listener failures", () => {
    const failingListener = vi.fn(() => {
      throw new Error("listener failed");
    });
    const listener = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unsubscribeFailing = subscribeToInAppAgentToolResults(
      "project-a",
      failingListener,
    );
    const unsubscribe = subscribeToInAppAgentToolResults("project-a", listener);

    publishInAppAgentToolResult(result);

    expect(listener).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();

    unsubscribeFailing();
    unsubscribe();
    consoleError.mockRestore();
  });

  it("retains only the latest result across an immediate remount", async () => {
    const unsubscribe = subscribeToInAppAgentToolResults(
      "project-a",
      () => undefined,
    );
    publishInAppAgentToolResult(result);
    unsubscribe();

    const unsubscribeRemounted = subscribeToInAppAgentToolResults(
      "project-a",
      () => undefined,
    );
    expect(getLatestInAppAgentToolResult("project-a")).toBe(result);

    unsubscribeRemounted();
    await Promise.resolve();
    expect(getLatestInAppAgentToolResult("project-a")).toBeUndefined();
  });
});
