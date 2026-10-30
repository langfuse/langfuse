import { EventType } from "@ag-ui/core";
import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { describe, expect, it } from "vitest";

import { IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME } from "@langfuse/shared/in-app-agent";
import {
  createInAppAgentToolPolicy,
  withInAppAgentToolApproval,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
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
    const toolMessage = await approveQuestionnaire({
      toolInputs: {
        [IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME]: {
          answers: [
            { selectedOptionIndexes: [1], otherText: null },
            { selectedOptionIndexes: [], otherText: null },
          ],
        },
      },
    });

    expect(toolMessage).not.toHaveProperty("error");
    expect(JSON.parse(String(toolMessage?.content))).toEqual({
      type: "questionnaireAnswers",
      answers: [
        { question: "Which evaluator type?", answer: ["Code"], skipped: false },
        { question: "Anything else?", answer: [], skipped: true },
      ],
    });
  });

  it("returns every question as skipped when an approval carries no answers", async () => {
    const toolMessage = await approveQuestionnaire({});

    expect(JSON.parse(String(toolMessage?.content))).toEqual({
      type: "questionnaireAnswers",
      answers: [
        { question: "Which evaluator type?", answer: [], skipped: true },
        { question: "Anything else?", answer: [], skipped: true },
      ],
    });
  });
});

describe("questionnaire approval pause", () => {
  it("pauses for the user when the questionnaire args are valid", async () => {
    const chunks = await streamQuestionnaireCall(questionnaireRequest.args);

    expect(chunks.map((chunk) => chunk.type)).toContain("tool-call-approval");
  });

  it("returns invalid questionnaire args to the model instead of pausing", async () => {
    const [firstQuestion, secondQuestion] = questionnaireRequest.args.questions;
    const chunks = await streamQuestionnaireCall({
      questions: [
        {
          ...firstQuestion,
          options: firstQuestion.options.map((option) => ({
            ...option,
            recommended: true,
          })),
        },
        secondQuestion,
      ],
    });

    const toolResult = chunks.find((chunk) => chunk.type === "tool-result");

    expect(chunks.map((chunk) => chunk.type)).not.toContain(
      "tool-call-approval",
    );
    expect(JSON.stringify(toolResult?.payload)).toContain(
      "Mark at most one option per question as recommended.",
    );
  });
});

type ScriptedModel = Extract<MastraModelConfig, { specificationVersion: "v3" }>;

const emptyUsage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

// Calls the questionnaire tool once, then stops on the next step.
async function streamQuestionnaireCall(args: unknown) {
  let step = 0;
  const respond = async () => {
    const isFirstStep = step++ === 0;

    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          if (isFirstStep) {
            controller.enqueue({
              type: "tool-call",
              toolCallId: "tool-call-3",
              toolName: IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
              input: JSON.stringify(args),
            });
          }
          controller.enqueue({
            type: "finish",
            finishReason: isFirstStep
              ? { unified: "tool-calls", raw: "tool_calls" }
              : { unified: "stop", raw: "stop" },
            usage: emptyUsage,
          });
          controller.close();
        },
      }),
    };
  };
  const model = {
    specificationVersion: "v3",
    provider: "openai.responses",
    modelId: "gpt-4.1",
    supportedUrls: {},
    doGenerate: respond,
    doStream: respond,
  } satisfies ScriptedModel;
  const agent = new Agent({
    id: "questionnaire-approval-probe",
    name: "questionnaire-approval-probe",
    instructions: "probe",
    model,
    tools: withInAppAgentToolApproval(
      { [IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME]: createQuestionnaireTool() },
      createInAppAgentToolPolicy({}),
    ),
  });

  const result = await agent.stream("ask me");
  const chunks: { type: string; payload?: unknown }[] = [];
  for await (const chunk of result.fullStream) {
    chunks.push(chunk);
  }

  return chunks;
}

const questionnaireRequest = {
  type: "tool_approval_request" as const,
  toolCallId: "tool-call-2",
  toolName: IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  args: {
    questions: [
      {
        question: "Which evaluator type?",
        options: [
          {
            label: "LLM-as-a-judge",
            description: "Model-graded",
            recommended: true,
          },
          { label: "Code", description: "Deterministic", recommended: false },
        ],
        allowMultiple: false,
      },
      {
        question: "Anything else?",
        options: [
          { label: "Yes", description: "Daily run", recommended: false },
          { label: "No", description: "Manual only", recommended: false },
        ],
        allowMultiple: false,
      },
    ],
  },
  runId: "interrupted-run-1",
};

async function approveQuestionnaire(resume: Record<string, unknown>) {
  const tool = createQuestionnaireTool();
  const { input } = await createManualToolApprovalRunInput({
    input: resumeInput({
      approved: true,
      approvalRequest: questionnaireRequest,
      ...resume,
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

  return input.messages.find((message) => message.role === "tool");
}
