import { describe, expect, it } from "vitest";

import {
  ChatMessageSchema,
  createChatPromptTool,
} from "@/src/features/mcp/server/prompts/tools/createChatPrompt";

type JsonSchema = Record<string, unknown>;

const promptItemJsonSchema = () => {
  const inputSchema = createChatPromptTool.inputSchema as {
    properties?: Record<string, unknown>;
  };
  const prompt = inputSchema.properties?.prompt as JsonSchema;
  return prompt.items as JsonSchema;
};

describe("createChatPrompt placeholder messages", () => {
  it("accepts literal chat messages (role + content)", () => {
    expect(ChatMessageSchema.parse({ role: "user", content: "Hello" })).toEqual(
      { role: "user", content: "Hello" },
    );
  });

  it("accepts literal chat messages with an explicit 'message' type", () => {
    expect(
      ChatMessageSchema.parse({
        type: "message",
        role: "user",
        content: "Hello",
      }),
    ).toEqual({ role: "user", content: "Hello" });
  });

  it("accepts placeholder messages referencing a runtime variable", () => {
    expect(
      ChatMessageSchema.parse({ type: "placeholder", name: "history" }),
    ).toEqual({ type: "placeholder", name: "history" });
  });

  it("rejects placeholder messages without a name", () => {
    expect(() => ChatMessageSchema.parse({ type: "placeholder" })).toThrow();
  });

  it("rejects placeholder names that do not start with a letter", () => {
    expect(() =>
      ChatMessageSchema.parse({ type: "placeholder", name: "1history" }),
    ).toThrow();
  });

  it("rejects placeholder names containing invalid characters", () => {
    expect(() =>
      ChatMessageSchema.parse({ type: "placeholder", name: "hist ory" }),
    ).toThrow();
  });

  it("serializes the base schema to JSON Schema without unions", () => {
    const serialized = JSON.stringify(createChatPromptTool.inputSchema);
    expect(serialized).not.toContain("oneOf");
    expect(serialized).not.toContain("anyOf");
    expect(serialized).not.toContain("allOf");
  });

  it("exposes the placeholder shape on the JSON Schema message items", () => {
    const items = promptItemJsonSchema();
    const properties = items.properties as Record<string, unknown>;

    expect(properties.type).toEqual(
      expect.objectContaining({ enum: ["message", "placeholder"] }),
    );
    expect(properties.name).toBeDefined();
    expect(properties.role).toBeDefined();
    expect(properties.content).toBeDefined();
  });
});
