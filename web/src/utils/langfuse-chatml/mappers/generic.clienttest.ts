// TODO: fix that mocking @langfuse/shared is required
jest.mock("@langfuse/shared", () => ({
  ChatMessageRole: {
    System: "system",
    Developer: "developer",
    User: "user",
    Assistant: "assistant",
    Tool: "tool",
    Model: "model",
  },
}));

import { genericMapper } from "./generic";

describe("genericMapper", () => {
  it("should be fallback mapper with score 0 and map basic ChatML", () => {
    // Always score 0 (fallback)
    expect(genericMapper.canMapScore("anything", "anything")).toBe(0);
    expect(genericMapper.canMapScore(null, undefined)).toBe(0);
    expect(genericMapper.canMapScore({}, {}, "openai")).toBe(0);

    // Map simple ChatML
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "Response" };

    const result = genericMapper.map(input, output);

    expect(result.canDisplayAsChat()).toBe(true);
    expect(result.getAllMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Hello!" }),
        expect.objectContaining({ role: "assistant", content: "Hi there!" }),
        expect.objectContaining({ role: "assistant", content: "Response" }),
      ]),
    );
    expect(result.input.messages).toHaveLength(2);
    expect(result.output.messages).toHaveLength(1);
  });

  it("should not display as chat if chat has no messages (or not parsed as in content-parts / google-adk)", () => {
    // Based on real google-adk trace data
    const input = {
      new_message: {
        parts: [{ text: "hi" }],
        role: "user",
      },
      run_config: {
        streaming_mode: "StreamingMode.NONE",
        max_llm_calls: 500,
      },
    };

    const output = {
      content: {
        parts: [{ text: "Hello Langfuse 👋!\n" }],
        role: "model",
      },
      finish_reason: "STOP",
      usage_metadata: {
        candidates_token_count: 6,
        candidates_tokens_details: [{ modality: "TEXT", token_count: 6 }],
        prompt_token_count: 39,
        prompt_tokens_details: [{ modality: "TEXT", token_count: 39 }],
        total_token_count: 45,
      },
      author: "hello_agent",
      actions: {
        state_delta: {},
        artifact_delta: {},
        requested_auth_configs: {},
      },
      id: "some-id",
      timestamp: 1756366351.22196,
    };

    const result = genericMapper.map(input, output);

    // Should NOT display as chat even though output parses successfully
    // because getAllMessages / combineInputOutputMessages returns 0
    expect(result.canDisplayAsChat()).toBe(false);
    expect(result.getAllMessages()).toHaveLength(0);
    expect(result.input.messages).toHaveLength(0);
    // Output technically parses as 1 message (has content field)
    // but won't be displayed in chat view since getAllMessages returns 0
    expect(result.output.messages).toHaveLength(1);

    // Output should be in additional field for rendering as JSON
    expect(result.output.additional).toBeDefined();
    expect(result.output.additional).toMatchObject({
      content: expect.objectContaining({
        parts: expect.any(Array),
        role: "model",
      }),
      finish_reason: "STOP",
    });
  });
});
