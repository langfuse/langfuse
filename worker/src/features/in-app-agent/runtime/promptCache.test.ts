import { describe, expect, it } from "vitest";

import {
  applyPromptCachePoints,
  applyPromptCacheToCall,
} from "./promptCache";

const bedrockCachePoint = {
  bedrock: { cachePoint: { type: "default" } },
};

const anthropicCacheControl = {
  anthropic: { cacheControl: { type: "ephemeral" } },
};

const twoMessagePrompt = [
  { role: "system", content: "You are the Langfuse assistant." },
  { role: "user", content: [{ type: "text", text: "hello" }] },
];

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
    expect(
      applyPromptCachePoints(
        [
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
        ],
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
    ]);
  });

  it("keeps the previous-turn checkpoint when a trailing current-time suffix is present", () => {
    expect(
      applyPromptCachePoints(
        [
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
          {
            role: "user",
            content: [
              {
                type: "text",
                text: '<current_time tz="Europe/London">2026-08-24 08:53</current_time>',
              },
            ],
          },
        ],
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
