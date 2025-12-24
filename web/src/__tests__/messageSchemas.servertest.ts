/** @jest-environment node */

import {
  MessageContentSchema,
  UserMessageSchema,
  ChatMessageType,
  ChatMessageRole,
} from "@langfuse/shared";

describe("MessageContentSchema", () => {
  it("should accept valid text content block", () => {
    const result = MessageContentSchema.safeParse({
      type: "text",
      text: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing text field", () => {
    const result = MessageContentSchema.safeParse({ type: "text" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid type", () => {
    const result = MessageContentSchema.safeParse({
      type: "invalid",
      text: "hello",
    });
    expect(result.success).toBe(false);
  });
});

describe("UserMessageSchema with array content", () => {
  it("should accept string content (backward compatibility)", () => {
    const result = UserMessageSchema.safeParse({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("should accept array of content blocks", () => {
    const result = UserMessageSchema.safeParse({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: [{ type: "text", text: "hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("should accept array with multiple content blocks", () => {
    const result = UserMessageSchema.safeParse({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject array with invalid content block", () => {
    const result = UserMessageSchema.safeParse({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: [{ type: "text" }], // missing text field
    });
    expect(result.success).toBe(false);
  });
});
