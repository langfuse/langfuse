import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const STEP_LIMIT_WRAP_UP_INSTRUCTION = `<step_limit_wrap_up>
This is your final step. Do not call any more tools. Summarize what you have found and give the user a complete final answer now.
</step_limit_wrap_up>`;

const EMPTY_USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

describe("in-app agent step-limit wrap-up", () => {
  it("puts wrap-up guidance on the last model call after the penultimate Mastra iteration", async () => {
    const prompts: unknown[] = [];
    let call = 0;
    const respond = async (options: { prompt?: unknown }) => {
      prompts.push(options.prompt);
      call += 1;
      if (call === 1) {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "call-1",
              toolName: "ping",
              input: "{}",
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
          usage: EMPTY_USAGE,
          warnings: [],
        };
      }

      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: { unified: "stop" as const, raw: "end_turn" },
        usage: EMPTY_USAGE,
        warnings: [],
      };
    };
    const model = {
      specificationVersion: "v3" as const,
      provider: "test",
      modelId: "test",
      supportedUrls: {},
      doGenerate: respond,
      doStream: respond,
    };

    const stepLimitState = { wrapUp: false };
    const maxSteps = 2;
    const agent = new Agent({
      id: "wrap-up-probe",
      name: "wrap-up-probe",
      instructions: () =>
        stepLimitState.wrapUp
          ? `Base.\n\n${STEP_LIMIT_WRAP_UP_INSTRUCTION}`
          : "Base.",
      model,
      tools: {
        ping: createTool({
          id: "ping",
          description: "Ping",
          inputSchema: z.object({}),
          execute: async () => "pong",
        }),
      },
      defaultOptions: {
        maxSteps,
        onIterationComplete: ({ iteration, maxIterations, isFinal }) => {
          if (iteration === (maxIterations ?? maxSteps) - 1 && !isFinal) {
            stepLimitState.wrapUp = true;
            return { feedback: STEP_LIMIT_WRAP_UP_INSTRUCTION };
          }
        },
      },
    });

    await agent.generate("use ping then stop");

    expect(prompts).toHaveLength(2);
    expect(JSON.stringify(prompts[0])).not.toContain("<step_limit_wrap_up>");
    expect(JSON.stringify(prompts[1])).toContain("<step_limit_wrap_up>");
  });
});
