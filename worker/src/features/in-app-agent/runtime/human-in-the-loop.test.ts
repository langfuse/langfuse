import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME } from "@langfuse/shared/in-app-agent";
import { createManualToolApprovalRunInput } from "./human-in-the-loop";
import { createQuestionnaireTool } from "./tools";
import type { AgUiRunAgentInput } from "./types";

const approvalRequest = {
  type: "tool_approval_request" as const,
  toolCallId: "tool-call-1",
  toolName: "langfuse_createScoreConfig",
  args: { name: "readiness", dataType: "NUMERIC" },
  runId: "interrupted-run-1",
};

function resumeInput(
  resume: Record<string, unknown> = { approved: true, approvalRequest },
): AgUiRunAgentInput {
  return {
    threadId: "conversation-1",
    runId: "run-2",
    messages: [
      {
        id: "user-message-1",
        role: "user",
        content: "create a readiness score config",
      },
    ],
    tools: [],
    context: [],
    forwardedProps: {
      command: { resume },
    },
  };
}

function toolResultContent(events: { type: string; content?: string }[]) {
  return events.find((event) => event.type === EventType.TOOL_CALL_RESULT)
    ?.content;
}

describe("createManualToolApprovalRunInput", () => {
  it("resumes a non-silent approval with the inner payload, not the LanguageModelV3 wrapper", async () => {
    const result = {
      id: "score-config-1",
      name: "readiness",
      dataType: "NUMERIC",
    };

    const { input, syntheticEvents } = await createManualToolApprovalRunInput({
      input: resumeInput(),
      executeToolCall: async () => ({
        result,
        modelResult: { type: "json", value: result },
      }),
    });
    const toolMessage = input.messages.find(
      (message) => message.role === "tool",
    );

    expect(toolMessage?.content).toEqual(JSON.stringify(result));
    expect(toolResultContent(syntheticEvents)).toEqual(JSON.stringify(result));
  });

  it("persists a silent approval envelope and resumes with the sandbox path", async () => {
    const envelope = {
      type: "silent-mcp-output",
      toolCallId: "tool-call-1",
      toolName: "langfuse_createScoreConfig",
      output: { id: "score-config-1", secret: "full-tool-output" },
    };
    const path =
      "Output saved to /workspace/tool_calls/langfuse_createScoreConfig_tool-call-1.json";

    const { input, syntheticEvents } = await createManualToolApprovalRunInput({
      input: resumeInput(),
      executeToolCall: async () => ({
        result: envelope,
        modelResult: { type: "text", value: path },
      }),
    });
    const toolMessage = input.messages.find(
      (message) => message.role === "tool",
    );

    expect(toolMessage?.content).toEqual(path);
    expect(toolResultContent(syntheticEvents)).toEqual(
      JSON.stringify(envelope),
    );
  });

  it("hands questionnaire answers to the tool and returns them to the model", async () => {
    const tool = createQuestionnaireTool();
    const questionnaireRequest = {
      type: "tool_approval_request" as const,
      toolCallId: "tool-call-2",
      toolName: IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
      args: {
        questions: [
          {
            question: "Which evaluator type?",
            options: [
              { label: "LLM-as-a-judge", description: null, recommended: true },
              { label: "Code", description: null, recommended: false },
            ],
            allowMultiple: false,
            allowOther: false,
          },
          {
            question: "Anything else?",
            options: [],
            allowMultiple: false,
            allowOther: false,
          },
        ],
      },
      runId: "interrupted-run-1",
    };

    const { input } = await createManualToolApprovalRunInput({
      input: resumeInput({
        approved: true,
        approvalRequest: questionnaireRequest,
        answers: [
          { selectedOptionIndexes: [1], otherText: null },
          { selectedOptionIndexes: [], otherText: null },
        ],
      }),
      executeToolCall: async (request, resumeData) => {
        const result = await tool.execute?.(request.args as never, {
          agent: {
            agentId: "test",
            toolCallId: request.toolCallId,
            messages: [],
            suspend: async () => undefined,
            resumeData,
          },
        });
        return { result, modelResult: result };
      },
    });
    const toolMessage = input.messages.find(
      (message) => message.role === "tool",
    );

    expect(toolMessage).not.toHaveProperty("error");
    expect(JSON.parse(String(toolMessage?.content))).toEqual({
      type: "questionnaireAnswers",
      answers: [
        { question: "Which evaluator type?", answer: ["Code"], skipped: false },
        { question: "Anything else?", answer: [], skipped: true },
      ],
    });
  });
});
