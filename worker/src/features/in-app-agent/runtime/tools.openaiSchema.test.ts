import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { describe, expect, it } from "vitest";

import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@langfuse/shared/in-app-agent";
import { createRedirectActionTool } from "./tools";

type OpenAIResponsesModel = Extract<
  MastraModelConfig,
  { specificationVersion: "v3" }
>;
type CallOptions = Parameters<OpenAIResponsesModel["doStream"]>[0];

// Records the tool definitions Mastra sends and ends the loop after one step.
function createRecordingOpenAIModel() {
  const calls: CallOptions[] = [];
  const respond = async (options: CallOptions) => {
    calls.push(options);

    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 0, text: 0, reasoning: 0 },
            },
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
  } satisfies OpenAIResponsesModel;

  return { model, calls };
}

// Nesting depth of optional wrappers (`anyOf: [..., { type: "null" }]`).
function maxOptionalNesting(node: unknown): number {
  if (typeof node !== "object" || node === null) {
    return 0;
  }

  const self =
    Array.isArray((node as { anyOf?: unknown[] }).anyOf) &&
    (node as { anyOf: unknown[] }).anyOf.some(
      (branch) =>
        typeof branch === "object" &&
        branch !== null &&
        (branch as { type?: unknown }).type === "null",
    )
      ? 1
      : 0;

  return (
    self +
    Math.max(
      0,
      ...Object.values(node).map((child) => maxOptionalNesting(child)),
    )
  );
}

describe("in-app agent redirect tool schema on OpenAI", () => {
  // Nesting 3 (~23 KB) makes OpenAI Responses return `incomplete` /
  // `max_output_tokens` with zero usage; nesting 2 (~12 KB) is accepted.
  it("stays within the optional nesting OpenAI accepts", async () => {
    const { model, calls } = createRecordingOpenAIModel();
    const agent = new Agent({
      id: "redirect-schema-probe",
      name: "redirect-schema-probe",
      instructions: "probe",
      model,
      tools: {
        [IN_APP_AGENT_REDIRECT_TOOL_NAME]: createRedirectActionTool({
          projectId: "project-id",
          isV4Enabled: true,
        }),
      },
    });

    const result = await agent.stream("hi");
    await result.text;

    const redirectTool = calls
      .flatMap((call) => call.tools ?? [])
      .find(
        (tool) =>
          tool.type === "function" &&
          tool.name === IN_APP_AGENT_REDIRECT_TOOL_NAME,
      );
    if (redirectTool?.type !== "function") {
      throw new Error("redirect tool was not sent to the model");
    }

    const schema = redirectTool.inputSchema;
    expect(maxOptionalNesting(schema)).toBeLessThanOrEqual(2);
    expect(JSON.stringify(schema).length).toBeLessThan(16_000);
  });
});
