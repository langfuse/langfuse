import { describe, expect, it } from "vitest";

import {
  applyBedrockPromptCachePoints,
  applyBedrockPromptCacheToCall,
} from "./bedrockPromptCache";

const cachePoint = {
  bedrock: { cachePoint: { type: "default" } },
};

describe("applyBedrockPromptCachePoints", () => {
  it("caches the stable system prefix and the growing conversation prefix", () => {
    // Bedrock evaluates checkpoints as tools → system → messages. Tagging the
    // last leading system message writes tools+system; tagging the last
    // message writes that plus prior turns so the next agent step can read it.
    expect(
      applyBedrockPromptCachePoints([
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
      ]),
    ).toEqual([
      { role: "system", content: "You are the Langfuse assistant." },
      {
        role: "system",
        content: "Skill: error analysis.",
        providerOptions: cachePoint,
      },
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
        providerOptions: cachePoint,
      },
    ]);
  });

  it("re-stamps the previous turn's last prefix so a follow-up user message can cache-read it", () => {
    expect(
      applyBedrockPromptCachePoints([
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
      ]),
    ).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: cachePoint,
      },
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
        providerOptions: cachePoint,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "You have 20 prompts." }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "and the versions?" }],
        providerOptions: cachePoint,
      },
    ]);
  });

  it("writes a single checkpoint when the prompt is only system messages", () => {
    expect(
      applyBedrockPromptCachePoints([
        { role: "system", content: "You are the Langfuse assistant." },
      ]),
    ).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        providerOptions: cachePoint,
      },
    ]);
  });

  it("keeps existing provider options and does not replace an existing cache point", () => {
    expect(
      applyBedrockPromptCachePoints([
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
      ]),
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
  });
});

describe("applyBedrockPromptCacheToCall", () => {
  it("adds cache points for Claude models and leaves other models unchanged", () => {
    const options = {
      prompt: [
        { role: "system", content: "You are the Langfuse assistant." },
        { role: "user", content: [{ type: "text", text: "hello" }] },
      ],
      maxOutputTokens: 1024,
    };

    expect(
      applyBedrockPromptCacheToCall("meta.llama3-70b-instruct-v1:0", options),
    ).toBe(options);
    expect(
      applyBedrockPromptCacheToCall("eu.anthropic.claude-opus-4-8", options),
    ).toEqual({
      maxOutputTokens: 1024,
      prompt: [
        {
          role: "system",
          content: "You are the Langfuse assistant.",
          providerOptions: cachePoint,
        },
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
          providerOptions: cachePoint,
        },
      ],
    });
  });

  it("appends turn-scoped context to the last user message for every model", () => {
    const options = {
      prompt: [
        { role: "system", content: "You are the Langfuse assistant." },
        { role: "user", content: "hello" },
      ],
    };

    expect(
      applyBedrockPromptCacheToCall(
        "meta.llama3-70b-instruct-v1:0",
        options,
        "<screen_context>current page</screen_context>",
      ),
    ).toEqual({
      prompt: [
        { role: "system", content: "You are the Langfuse assistant." },
        {
          role: "user",
          content: "hello\n\n<screen_context>current page</screen_context>",
        },
      ],
    });
  });
});
