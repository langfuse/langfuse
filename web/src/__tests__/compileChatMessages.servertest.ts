/** @jest-environment node */

import { ChatMessageType, compileChatMessages, extractPlaceholderNames } from "@langfuse/shared";

describe("compileChatMessages", () => {
  it("should compile message placeholders with provided values", () => {
    // Simulates how message placeholders would be compiled
    // during execution (e.g., in playground or experiments)

    const promptTemplate = [
      { role: "system", content: "You are a helpful assistant." },
      {
        type: ChatMessageType.Placeholder,
        name: "conversation_history"
      },
      { role: "user", content: "{{user_question}}" }
    ];

    const placeholderValues = {
      conversation_history: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there! How can I help you?" },
        { role: "user", content: "What's the weather like?" }
      ]
    };

    const textVariables = {
      user_question: "Can you continue our conversation?"
    };

    // Simulate compilation logic that would happen in playground/experiments
    const compiledMessages = compileChatMessages(
      promptTemplate,
      placeholderValues,
      textVariables
    );

    expect(compiledMessages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there! How can I help you?" },
      { role: "user", content: "What's the weather like?" },
      { role: "user", content: "Can you continue our conversation?" }
    ]);
  });

  it("should throw error when placeholder value is missing", () => {
    const promptTemplate = [
      { role: "system", content: "You are a helpful assistant." },
      {
        type: ChatMessageType.Placeholder,
        name: "missing_placeholder"
      },
      { role: "user", content: "Hello" }
    ];

    const placeholderValues = {};

    expect(() => {
      compileChatMessages(promptTemplate, placeholderValues);
    }).toThrow("Missing value for message placeholder: missing_placeholder");
  });

  it("should throw error when placeholder messages lack required properties", () => {
    const promptTemplate = [
      {
        type: ChatMessageType.Placeholder,
        name: "invalid_messages"
      }
    ];

    // Test missing role property
    const placeholderValuesNoRole = {
      invalid_messages: [
        { content: "Hello" }
      ]
    };

    expect(() => {
      compileChatMessages(promptTemplate, placeholderValuesNoRole);
    }).toThrow("Invalid message format in placeholder 'invalid_messages': messages must have 'role' and 'content' properties");

    // Test missing content property
    const placeholderValuesNoContent = {
      invalid_messages: [
        { role: "user" }
      ]
    };

    expect(() => {
      compileChatMessages(promptTemplate, placeholderValuesNoContent);
    }).toThrow("Invalid message format in placeholder 'invalid_messages': messages must have 'role' and 'content' properties");
  });

  it("should compile placeholders without applying text substitutions when no variables provided", () => {
    const promptTemplate = [
      { role: "system", content: "You are a helpful assistant. {{system_var}}" },
      {
        type: ChatMessageType.Placeholder,
        name: "history"
      },
      { role: "user", content: "{{user_var}}" }
    ];

    const placeholderValues = {
      history: [
        { role: "user", content: "Previous message with {{var}}" },
        { role: "assistant", content: "Response with {{another_var}}" }
      ]
    };

    // No text variables provided
    const compiledMessages = compileChatMessages(promptTemplate, placeholderValues);

    expect(compiledMessages).toEqual([
      { role: "system", content: "You are a helpful assistant. {{system_var}}" },
      { role: "user", content: "Previous message with {{var}}" },
      { role: "assistant", content: "Response with {{another_var}}" },
      { role: "user", content: "{{user_var}}" }
    ]);
  });

  it("should extract all placeholder names from messages", () => {
    const promptTemplate = [
      { role: "system", content: "System message" },
      {
        type: ChatMessageType.Placeholder,
        name: "history"
      },
      { role: "user", content: "User message" },
      {
        type: ChatMessageType.Placeholder,
        name: "context"
      }
    ];

    const placeholderNames = extractPlaceholderNames(promptTemplate);

    expect(placeholderNames).toEqual(["history", "context"]);
  });

  it("should return empty array when no placeholders exist", () => {
    const promptTemplate = [
      { role: "system", content: "System message" },
      { role: "user", content: "User message" }
    ];

    const placeholderNames = extractPlaceholderNames(promptTemplate);

    expect(placeholderNames).toEqual([]);
  });
});
