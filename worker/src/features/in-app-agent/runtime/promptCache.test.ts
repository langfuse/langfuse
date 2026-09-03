import { describe, expect, it } from "vitest";

import { applyPromptCachePoints, applyPromptCacheToCall } from "./promptCache";

const bedrockCachePoint = {
  bedrock: { cachePoint: { type: "default" } },
};

const anthropicCacheControl = {
  anthropic: { cacheControl: { type: "ephemeral" } },
};

const openaiCacheBreakpoint = {
  openai: { promptCacheBreakpoint: { mode: "explicit" } },
};

const twoMessagePrompt = [
  { role: "system", content: "You are the Langfuse assistant." },
  { role: "user", content: [{ type: "text", text: "hello" }] },
];

// One completed tool turn followed by a new user turn.
const toolTurnPrompt = [
  { role: "system", content: "You are the Langfuse assistant." },
  { role: "user", content: [{ type: "text", text: "hello" }] },
  {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call-1" }],
  },
  {
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "call-1" }],
  },
  {
    role: "assistant",
    content: [{ type: "text", text: "You have 20 prompts." }],
  },
  {
    role: "user",
    content: [{ type: "text", text: "and the versions?" }],
  },
];

const currentTimeMessage = {
  role: "user",
  content: [
    {
      type: "text",
      text: '<current_time tz="Europe/London">2026-08-24 08:53</current_time>',
    },
  ],
};

describe("applyPromptCachePoints", () => {
  it("caches the stable system prefix and the growing conversation prefix", () => {
    // Checkpoints are tools → system → messages. Tagging the last leading
    // system message writes tools+system; tagging the last message writes
    // that plus prior turns so the next agent step can read it.
    expect(
      applyPromptCachePoints(
        [
          { role: "system", content: "You are the Langfuse assistant." },
          { role: "system", content: "Skill: error analysis." },
          { role: "user", content: [{ type: "text", text: "hello" }] },
          {
            role: "assistant",
            content: [{ type: "tool-call", toolCallId: "call-1" }],
          },
          {
            role: "tool",
            content: [{ type: "tool-result", toolCallId: "call-1" }],
          },
        ],
        "bedrock",
      ),
    ).toEqual([
      { role: "system", content: "You are the Langfuse assistant." },
      {
        role: "system",
        content: "Skill: error analysis.",
        providerOptions: bedrockCachePoint,
      },
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
        providerOptions: bedrockCachePoint,
      },
    ]);
  });

  it("re-stamps the previous turn's last prefix so a follow-up user message can cache-read it", () => {
    expect(applyPromptCachePoints(toolTurnPrompt, "bedrock")).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: bedrockCachePoint,
      },
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
        providerOptions: bedrockCachePoint,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "You have 20 prompts." }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "and the versions?" }],
        providerOptions: bedrockCachePoint,
      },
    ]);
  });

  it("keeps the previous-turn checkpoint when a trailing current-time suffix is present", () => {
    expect(
      applyPromptCachePoints(
        [...toolTurnPrompt, currentTimeMessage],
        "bedrock",
      ),
    ).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: bedrockCachePoint,
      },
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
        providerOptions: bedrockCachePoint,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "You have 20 prompts." }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "and the versions?" }],
        providerOptions: bedrockCachePoint,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: '<current_time tz="Europe/London">2026-08-24 08:53</current_time>',
          },
        ],
      },
    ]);
  });

  it("walks a Responses checkpoint back from a tool result to the nearest user message", () => {
    // The Responses converter emits `prompt_cache_breakpoint` for system
    // messages, user parts, and content-typed tool outputs, not for assistant
    // messages or this agent's JSON tool results. A checkpoint chosen for one
    // of those walks back to the nearest user or system message so the next
    // in-loop step still has an explicit read point after tools+system.
    expect(
      applyPromptCachePoints(
        [
          { role: "system", content: "You are the Langfuse assistant." },
          { role: "system", content: "Skill: error analysis." },
          {
            role: "user",
            content: [
              { type: "file", data: "aGk=", mediaType: "image/png" },
              { type: "text", text: "hello" },
            ],
          },
          {
            role: "assistant",
            content: [{ type: "tool-call", toolCallId: "call-1" }],
          },
          {
            role: "tool",
            content: [{ type: "tool-result", toolCallId: "call-1" }],
          },
          currentTimeMessage,
        ],
        "openai-responses",
      ),
    ).toEqual([
      { role: "system", content: "You are the Langfuse assistant." },
      {
        role: "system",
        content: "Skill: error analysis.",
        providerOptions: openaiCacheBreakpoint,
      },
      {
        role: "user",
        content: [
          { type: "file", data: "aGk=", mediaType: "image/png" },
          {
            type: "text",
            text: "hello",
            providerOptions: openaiCacheBreakpoint,
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: '<current_time tz="Europe/London">2026-08-24 08:53</current_time>',
          },
        ],
      },
    ]);
  });

  it("stamps the previous turn's user message and the new user turn for Responses", () => {
    expect(applyPromptCachePoints(toolTurnPrompt, "openai-responses")).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: openaiCacheBreakpoint,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "hello",
            providerOptions: openaiCacheBreakpoint,
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "You have 20 prompts." }],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "and the versions?",
            providerOptions: openaiCacheBreakpoint,
          },
        ],
      },
    ]);
  });

  it("writes a single checkpoint when the prompt is only system messages", () => {
    expect(
      applyPromptCachePoints(
        [{ role: "system", content: "You are the Langfuse assistant." }],
        "bedrock",
      ),
    ).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: bedrockCachePoint,
      },
    ]);
  });

  it("keeps existing provider options and does not replace an existing cache stamp", () => {
    expect(
      applyPromptCachePoints(
        [
          {
            role: "system",
            content: "You are the Langfuse assistant.",
            providerOptions: { bedrock: { somethingElse: true } },
          },
          {
            role: "user",
            content: [{ type: "text", text: "hello" }],
            providerOptions: {
              bedrock: { cachePoint: { type: "default", ttl: "1h" } },
            },
          },
        ],
        "bedrock",
      ),
    ).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: {
          bedrock: { somethingElse: true, cachePoint: { type: "default" } },
        },
      },
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
        providerOptions: {
          bedrock: { cachePoint: { type: "default", ttl: "1h" } },
        },
      },
    ]);

    expect(
      applyPromptCachePoints(
        [
          {
            role: "system",
            content: "You are the Langfuse assistant.",
            providerOptions: { anthropic: { somethingElse: true } },
          },
          {
            role: "user",
            content: [{ type: "text", text: "hello" }],
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
            },
          },
        ],
        "anthropic",
      ),
    ).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: {
          anthropic: {
            somethingElse: true,
            cacheControl: { type: "ephemeral" },
          },
        },
      },
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
        },
      },
    ]);
  });
});

describe("applyPromptCacheToCall", () => {
  it("stamps Anthropic cacheControl for native Claude Messages", () => {
    const options = {
      prompt: twoMessagePrompt,
      maxOutputTokens: 1024,
    };

    expect(
      applyPromptCacheToCall({
        provider: "anthropic.messages",
        modelId: "claude-opus-4-8",
        options,
      }),
    ).toEqual({
      maxOutputTokens: 1024,
      prompt: [
        {
          role: "system",
          content: "You are the Langfuse assistant.",
          providerOptions: anthropicCacheControl,
        },
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
          providerOptions: anthropicCacheControl,
        },
      ],
    });
  });

  it("stamps Responses prompt_cache_breakpoint for Claude ids and leaves GPT ids unchanged", () => {
    const options = {
      prompt: twoMessagePrompt,
      maxOutputTokens: 1024,
    };

    expect(
      applyPromptCacheToCall({
        provider: "openai.responses",
        modelId: "gpt-5.6-sol",
        options,
      }),
    ).toBe(options);
    expect(
      applyPromptCacheToCall({
        provider: "openai.responses",
        modelId: "claude-opus-5",
        options,
      }),
    ).toEqual({
      maxOutputTokens: 1024,
      prompt: [
        {
          role: "system",
          content: "You are the Langfuse assistant.",
          providerOptions: openaiCacheBreakpoint,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "hello",
              providerOptions: openaiCacheBreakpoint,
            },
          ],
        },
      ],
    });
  });

  it("stamps Bedrock cache points for Claude models and leaves other models unchanged", () => {
    const options = {
      prompt: twoMessagePrompt,
      maxOutputTokens: 1024,
    };

    expect(
      applyPromptCacheToCall({
        provider: "amazon-bedrock",
        modelId: "meta.llama3-70b-instruct-v1:0",
        options,
      }),
    ).toBe(options);
    expect(
      applyPromptCacheToCall({
        provider: "amazon-bedrock",
        modelId: "eu.anthropic.claude-opus-4-8",
        options,
      }),
    ).toEqual({
      maxOutputTokens: 1024,
      prompt: [
        {
          role: "system",
          content: "You are the Langfuse assistant.",
          providerOptions: bedrockCachePoint,
        },
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
          providerOptions: bedrockCachePoint,
        },
      ],
    });
  });
});
