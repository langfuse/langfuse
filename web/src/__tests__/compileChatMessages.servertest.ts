/** @jest-environment node */

import {
  ChatMessageType,
  compileChatMessages,
  extractPlaceholderNames,
} from "@langfuse/shared";

describe("compileChatMessages", () => {
  it("should compile message placeholders with provided values", () => {
    // Simulates how message placeholders would be compiled
    // during execution (e.g., in playground or experiments)

    const promptTemplate = [
      { role: "system", content: "You are a helpful assistant." },
      {
        type: ChatMessageType.Placeholder,
        name: "conversation_history",
      },
      { role: "user", content: "{{user_question}}" },
    ];

    const placeholderValues = {
      conversation_history: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there! How can I help you?" },
        { role: "user", content: "What's the weather like?" },
      ],
    };

    const textVariables = {
      user_question: "Can you continue our conversation?",
    };

    // Simulate compilation logic that would happen in playground/experiments
    const compiledMessages = compileChatMessages(
      promptTemplate,
      placeholderValues,
      textVariables,
    );

    expect(compiledMessages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there! How can I help you?" },
      { role: "user", content: "What's the weather like?" },
      { role: "user", content: "Can you continue our conversation?" },
    ]);
  });

  it("should throw error when placeholder value is missing", () => {
    const promptTemplate = [
      { role: "system", content: "You are a helpful assistant." },
      {
        type: ChatMessageType.Placeholder,
        name: "missing_placeholder",
      },
      { role: "user", content: "Hello" },
    ];

    const placeholderValues = {};

    expect(() => {
      compileChatMessages(promptTemplate, placeholderValues);
    }).toThrow("Missing value for message placeholder: missing_placeholder");
  });

  it("should allow arbitrary placeholder fill-in values", () => {
    const promptTemplate = [
      { role: "system", content: "You are a helpful assistant." },
      {
        type: ChatMessageType.Placeholder,
        name: "arbitrary_messages",
      },
    ];

    // Test with arbitrary objects (non-role/content structure)
    const placeholderValues = {
      arbitrary_messages: [
        { type: "custom", data: ["some data", "and some more data!"], id: 123 },
        { action: "click", target: "button", value: "submit" },
        { role: "user", content: "This still works" }, // Mixed with standard format
      ],
    };

    const compiledMessages = compileChatMessages(
      promptTemplate,
      placeholderValues,
    );

    expect(compiledMessages).toHaveLength(4);
    expect(compiledMessages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(compiledMessages[1]).toEqual({
      type: "custom",
      data: ["some data", "and some more data!"],
      id: 123,
    });
    expect(compiledMessages[2]).toEqual({
      action: "click",
      target: "button",
      value: "submit",
    });
    expect(compiledMessages[3]).toEqual({
      role: "user",
      content: "This still works",
    });
  });

  it("should compile placeholders without applying text substitutions when no variables provided", () => {
    const promptTemplate = [
      {
        role: "system",
        content: "You are a helpful assistant. {{system_var}}",
      },
      {
        type: ChatMessageType.Placeholder,
        name: "history",
      },
      { role: "user", content: "{{user_var}}" },
    ];

    const placeholderValues = {
      history: [
        { role: "user", content: "Previous message with {{var}}" },
        { role: "assistant", content: "Response with {{another_var}}" },
      ],
    };

    // No text variables provided
    const compiledMessages = compileChatMessages(
      promptTemplate,
      placeholderValues,
    );

    expect(compiledMessages).toEqual([
      {
        role: "system",
        content: "You are a helpful assistant. {{system_var}}",
      },
      { role: "user", content: "Previous message with {{var}}" },
      { role: "assistant", content: "Response with {{another_var}}" },
      { role: "user", content: "{{user_var}}" },
    ]);
  });

  it("should extract all placeholder names from messages", () => {
    const promptTemplate = [
      { role: "system", content: "System message" },
      {
        type: ChatMessageType.Placeholder,
        name: "history",
      },
      { role: "user", content: "User message" },
      {
        type: ChatMessageType.Placeholder,
        name: "context",
      },
    ];

    const placeholderNames = extractPlaceholderNames(promptTemplate);

    expect(placeholderNames).toEqual(["history", "context"]);
  });

  it("should return empty array when no placeholders exist", () => {
    const promptTemplate = [
      { role: "system", content: "System message" },
      { role: "user", content: "User message" },
    ];

    const placeholderNames = extractPlaceholderNames(promptTemplate);

    expect(placeholderNames).toEqual([]);
  });
});
