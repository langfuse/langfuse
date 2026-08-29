/**
 * Captures the provider-facing prompt Mastra 1.46 actually emits so cache
 * breakpoints can sit on a stable prefix.
 *
 * Observed order on each model call:
 *   tools (including skill / skill_read / skill_search when skills exist)
 *   system: Agent.instructions
 *   system: defaultOptions.system or generate({ system })
 *   optional generate({ context }) user messages
 *   conversation messages
 *   processLLMRequest trailing user suffix
 *
 * Skill bodies stay out of the first call; only metadata is in the leading
 * system run. generate({ instructions }) replaces the constructor
 * instructions. generate({ context }) lands after system and before the
 * user turn, so page/clock data must not use that channel.
 */
import { Agent } from "@mastra/core/agent";
import type { Processor } from "@mastra/core/processors";
import { createSkill } from "@mastra/core/skills";
import { describe, expect, it } from "vitest";

import { applyPromptCachePoints } from "./promptCache";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STABLE_INSTRUCTIONS = "STABLE_INSTRUCTIONS_PREFIX";
const SANDBOX_RESET_SYSTEM = "SANDBOX_RESET_SYSTEM";
const PER_CALL_INSTRUCTIONS = "PER_CALL_INSTRUCTIONS_OVERRIDE";
const PER_CALL_SYSTEM = "PER_CALL_SYSTEM_APPEND";
const SKILL_NAME = "error-analysis";
const SKILL_DESCRIPTION = "Use when analysing pipeline failures.";
const SKILL_BODY = "SKILL_BODY_ERROR_ANALYSIS";
const CONTEXT_MESSAGE = "MASTRA_CONTEXT_MESSAGE";
const USER_TURN = "USER_TURN_HELLO";
const PRIOR_ASSISTANT = "PRIOR_ASSISTANT_REPLY";
const FOLLOW_UP_USER = "USER_TURN_FOLLOWUP";
const TRAILING_TIME = '<current_time tz="UTC">2026-08-29 08:00</current_time>';

type CapturedModelCall = {
  prompt: unknown[];
  tools: unknown;
};

class TrailingCurrentTimeProcessor implements Processor {
  readonly id = "current-time";

  processLLMRequest({ prompt }: { prompt: unknown[] }) {
    return {
      prompt: [
        ...prompt,
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: TRAILING_TIME }],
        },
      ],
    };
  }
}

function createRecordingModel(calls: CapturedModelCall[]) {
  const usage = {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: { total: 4, text: 4, reasoning: 0 },
  };

  const finishStream = () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({ type: "text-start", id: "text-1" });
        controller.enqueue({
          type: "text-delta",
          id: "text-1",
          delta: "ok",
        });
        controller.enqueue({ type: "text-end", id: "text-1" });
        controller.enqueue({
          type: "finish",
          finishReason: "stop",
          usage,
        });
        controller.close();
      },
    });

  const record = (options: { prompt?: unknown; tools?: unknown }) => {
    calls.push({
      prompt: Array.isArray(options.prompt) ? options.prompt : [],
      tools: options.tools,
    });
  };

  return {
    specificationVersion: "v3" as const,
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: async (options: { prompt?: unknown; tools?: unknown }) => {
      record(options);
      return {
        content: [{ type: "text", text: "ok" }],
        finishReason: "stop" as const,
        usage,
        warnings: [],
      };
    },
    doStream: async (options: { prompt?: unknown; tools?: unknown }) => {
      record(options);
      return { stream: finishStream() };
    },
  };
}

function messageRole(message: unknown) {
  return isRecord(message) && typeof message.role === "string"
    ? message.role
    : "unknown";
}

function messageText(message: unknown): string {
  if (!isRecord(message)) {
    return "";
  }

  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (isRecord(part) && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
}

function firstIndexContaining(prompt: unknown[], marker: string) {
  return prompt.findIndex((message) => messageText(message).includes(marker));
}

function lastLeadingSystemIndex(prompt: unknown[]) {
  let lastIndex = -1;
  for (let i = 0; i < prompt.length; i++) {
    if (messageRole(prompt[i]) !== "system") {
      break;
    }
    lastIndex = i;
  }
  return lastIndex;
}

function toolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools.flatMap((tool) => {
    if (!isRecord(tool)) {
      return [];
    }
    if (typeof tool.name === "string") {
      return [tool.name];
    }
    if (typeof tool.id === "string") {
      return [tool.id];
    }
    return [];
  });
}

function cachedPromptIndices(prompt: unknown[]) {
  const cached = applyPromptCachePoints(prompt, "bedrock");
  if (!Array.isArray(cached)) {
    return [];
  }

  return cached.flatMap((message, index) => {
    if (
      isRecord(message) &&
      isRecord(message.providerOptions) &&
      isRecord(message.providerOptions.bedrock) &&
      isRecord(message.providerOptions.bedrock.cachePoint)
    ) {
      return [index];
    }
    return [];
  });
}

function errorAnalysisSkill() {
  return createSkill({
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    instructions: SKILL_BODY,
  });
}

function createOrderAgent(params: {
  calls: CapturedModelCall[];
  skills?: ReturnType<typeof createSkill>[];
  system?: string;
}) {
  return new Agent({
    id: "mastra-prompt-order",
    name: "Mastra prompt order",
    instructions: STABLE_INSTRUCTIONS,
    model: createRecordingModel(params.calls),
    ...(params.skills ? { skills: params.skills } : {}),
    inputProcessors: [new TrailingCurrentTimeProcessor()],
    defaultOptions: {
      maxSteps: 1,
      ...(params.system ? { system: params.system } : {}),
    },
  });
}

async function captureFirstCall(
  agent: Agent,
  messages: Parameters<Agent["generate"]>[0],
  options?: Parameters<Agent["generate"]>[1],
) {
  const result = await agent.generate(messages, {
    maxSteps: 1,
    ...options,
  });
  await result.text;
  return result;
}

describe("Mastra model-call prompt order", () => {
  it("places constructor instructions and defaultOptions.system before conversation, and the processLLMRequest clock last", async () => {
    const calls: CapturedModelCall[] = [];
    const agent = createOrderAgent({
      calls,
      system: SANDBOX_RESET_SYSTEM,
    });

    await captureFirstCall(agent, USER_TURN);

    expect(calls).toHaveLength(1);
    const prompt = calls[0]?.prompt ?? [];
    const instructionsIndex = firstIndexContaining(prompt, STABLE_INSTRUCTIONS);
    const systemIndex = firstIndexContaining(prompt, SANDBOX_RESET_SYSTEM);
    const userIndex = firstIndexContaining(prompt, USER_TURN);
    const suffixIndex = firstIndexContaining(prompt, TRAILING_TIME);

    expect(messageRole(prompt[instructionsIndex])).toBe("system");
    expect(messageRole(prompt[systemIndex])).toBe("system");
    expect(messageRole(prompt[userIndex])).toBe("user");
    expect(messageRole(prompt[suffixIndex])).toBe("user");

    expect(instructionsIndex).toBeGreaterThanOrEqual(0);
    expect(systemIndex).toBeGreaterThan(instructionsIndex);
    expect(userIndex).toBeGreaterThan(systemIndex);
    expect(suffixIndex).toBe(prompt.length - 1);
    expect(suffixIndex).toBeGreaterThan(userIndex);
    expect(lastLeadingSystemIndex(prompt)).toBeGreaterThanOrEqual(systemIndex);
  });

  it("exposes skill metadata and skill tools on the first call without injecting the skill body", async () => {
    const calls: CapturedModelCall[] = [];
    const agent = createOrderAgent({
      calls,
      skills: [errorAnalysisSkill()],
    });

    await captureFirstCall(agent, USER_TURN);

    expect(calls).toHaveLength(1);
    const prompt = calls[0]?.prompt ?? [];
    const names = toolNames(calls[0]?.tools);
    // Observed Mastra 1.46 skill tools: skill, skill_read, skill_search.
    const skillMessageIndex = prompt.findIndex((message) => {
      const text = messageText(message);
      return (
        text.includes(SKILL_NAME) ||
        text.includes(SKILL_DESCRIPTION) ||
        text.includes(SKILL_BODY)
      );
    });

    expect(names).toEqual(
      expect.arrayContaining(["skill", "skill_read", "skill_search"]),
    );
    expect(
      prompt.some((message) => messageText(message).includes(SKILL_BODY)),
    ).toBe(false);
    expect(skillMessageIndex).toBeGreaterThanOrEqual(0);
    expect(skillMessageIndex).toBeLessThanOrEqual(
      lastLeadingSystemIndex(prompt),
    );
    expect(
      prompt.some(
        (message) =>
          messageText(message).includes(SKILL_NAME) ||
          messageText(message).includes(SKILL_DESCRIPTION),
      ),
    ).toBe(true);
  });

  it("places generate({ context }) after the leading system run and before the trailing clock", async () => {
    const calls: CapturedModelCall[] = [];
    const agent = createOrderAgent({ calls });

    await captureFirstCall(agent, USER_TURN, {
      context: [{ role: "user", content: CONTEXT_MESSAGE }],
    });

    expect(calls).toHaveLength(1);
    const prompt = calls[0]?.prompt ?? [];
    const leadingSystemIndex = lastLeadingSystemIndex(prompt);
    const contextIndex = firstIndexContaining(prompt, CONTEXT_MESSAGE);
    const userIndex = firstIndexContaining(prompt, USER_TURN);
    const suffixIndex = firstIndexContaining(prompt, TRAILING_TIME);

    expect(contextIndex).toBeGreaterThan(leadingSystemIndex);
    expect(contextIndex).toBeLessThan(suffixIndex);
    expect(userIndex).toBeGreaterThan(leadingSystemIndex);
    expect(suffixIndex).toBe(prompt.length - 1);
    // Mastra inserts `context` immediately after the leading system run,
    // before the persisted user turn. That would sit inside the growing
    // conversation prefix if we used this channel for page/clock data.
    expect(contextIndex).toBeLessThan(userIndex);
  });

  it("replaces constructor instructions when generate({ instructions }) is set", async () => {
    const calls: CapturedModelCall[] = [];
    const agent = createOrderAgent({ calls });

    await captureFirstCall(agent, USER_TURN, {
      instructions: PER_CALL_INSTRUCTIONS,
    });

    expect(calls).toHaveLength(1);
    const prompt = calls[0]?.prompt ?? [];
    const overrideIndex = firstIndexContaining(prompt, PER_CALL_INSTRUCTIONS);
    const stableIndex = firstIndexContaining(prompt, STABLE_INSTRUCTIONS);

    expect(overrideIndex).toBeGreaterThanOrEqual(0);
    expect(messageRole(prompt[overrideIndex])).toBe("system");
    expect(overrideIndex).toBeLessThanOrEqual(lastLeadingSystemIndex(prompt));
    expect(stableIndex).toBe(-1);
  });

  it("appends generate({ system }) inside the leading system run after constructor instructions", async () => {
    const calls: CapturedModelCall[] = [];
    const agent = createOrderAgent({ calls });

    await captureFirstCall(agent, USER_TURN, {
      system: PER_CALL_SYSTEM,
    });

    expect(calls).toHaveLength(1);
    const prompt = calls[0]?.prompt ?? [];
    const instructionsIndex = firstIndexContaining(prompt, STABLE_INSTRUCTIONS);
    const systemIndex = firstIndexContaining(prompt, PER_CALL_SYSTEM);
    const userIndex = firstIndexContaining(prompt, USER_TURN);

    expect(messageRole(prompt[systemIndex])).toBe("system");
    expect(systemIndex).toBeGreaterThan(instructionsIndex);
    expect(systemIndex).toBeLessThanOrEqual(lastLeadingSystemIndex(prompt));
    expect(userIndex).toBeGreaterThan(systemIndex);
  });

  it("stamps cache checkpoints on the last leading system and last conversation message, not the trailing clock", async () => {
    const calls: CapturedModelCall[] = [];
    const agent = createOrderAgent({
      calls,
      system: SANDBOX_RESET_SYSTEM,
    });

    await captureFirstCall(agent, [
      { role: "user", content: USER_TURN },
      { role: "assistant", content: PRIOR_ASSISTANT },
      { role: "user", content: FOLLOW_UP_USER },
    ]);

    expect(calls).toHaveLength(1);
    const prompt = calls[0]?.prompt ?? [];
    const leadingSystemIndex = lastLeadingSystemIndex(prompt);
    const instructionsIndex = firstIndexContaining(prompt, STABLE_INSTRUCTIONS);
    const followUpIndex = firstIndexContaining(prompt, FOLLOW_UP_USER);
    const suffixIndex = firstIndexContaining(prompt, TRAILING_TIME);
    const priorUserIndex = firstIndexContaining(prompt, USER_TURN);
    const cachedIndices = cachedPromptIndices(prompt);

    expect(suffixIndex).toBe(prompt.length - 1);
    expect(followUpIndex).toBe(suffixIndex - 1);
    expect(instructionsIndex).toBeGreaterThanOrEqual(0);
    expect(instructionsIndex).toBeLessThanOrEqual(leadingSystemIndex);
    expect(messageText(prompt[leadingSystemIndex])).toContain(
      SANDBOX_RESET_SYSTEM,
    );
    expect(cachedIndices).toContain(leadingSystemIndex);
    expect(cachedIndices).toContain(followUpIndex);
    expect(cachedIndices).toContain(priorUserIndex);
    expect(cachedIndices).not.toContain(suffixIndex);
  });
});
