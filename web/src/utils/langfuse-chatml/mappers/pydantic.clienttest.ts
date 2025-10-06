import { pydanticMapper } from "./pydantic";
import { MAPPER_SCORE_DEFINITIVE, MAPPER_SCORE_NONE } from "./base";

describe("pydanticMapper", () => {
  it("should detect Pydantic AI via metadata", () => {
    const metadata = {
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.system": "openai",
        "gen_ai.request.model": "gpt-4o",
      },
      scope: {
        name: "pydantic-ai",
        version: "0.2.15",
        attributes: {},
      },
    };

    // Should immediately detect as pydantic-ai due to scope.name
    expect(pydanticMapper.canMapScore({}, {}, metadata)).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );

    // Should not detect without scope.name
    expect(
      pydanticMapper.canMapScore(
        {},
        {},
        { attributes: { "gen_ai.system": "openai" } },
      ),
    ).toBe(MAPPER_SCORE_NONE);
  });

  it("should detect Pydantic AI via structural indicators", () => {
    const input = [
      {
        content: "You are a helpful assistant.",
        role: "system",
        "gen_ai.system": "openai",
        "gen_ai.message.index": 0,
        "event.name": "gen_ai.system.message",
      },
      {
        content: "What is the capital of Italy?",
        role: "user",
        "gen_ai.system": "openai",
        "gen_ai.message.index": 0,
        "event.name": "gen_ai.user.message",
      },
    ];

    const output = {
      index: 0,
      message: {
        role: "assistant",
        content: "Rome",
      },
      "gen_ai.system": "openai",
      "event.name": "gen_ai.choice",
    };

    // Should detect via structural indicators
    expect(pydanticMapper.canMapScore(input, null)).toBeGreaterThan(0);
    expect(pydanticMapper.canMapScore(null, output)).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = {
      messages: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi!" },
      ],
    };
    expect(pydanticMapper.canMapScore(regularInput, null)).toBe(
      MAPPER_SCORE_NONE,
    );
  });

  it("should map Pydantic AI format to ChatML", () => {
    const input = [
      {
        content: "You are a helpful assistant.",
        role: "system",
        "gen_ai.system": "openai",
        "gen_ai.message.index": 0,
        "event.name": "gen_ai.system.message",
      },
      {
        content: "What is the capital of Italy?",
        role: "user",
        "gen_ai.system": "openai",
        "gen_ai.message.index": 0,
        "event.name": "gen_ai.user.message",
      },
    ];

    const output = {
      index: 0,
      message: {
        role: "assistant",
        content: "Rome",
      },
      "gen_ai.system": "openai",
      "event.name": "gen_ai.choice",
    };

    const result = pydanticMapper.map(input, output);

    expect(result.input.messages).toHaveLength(2);
    expect(result.input.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
      json: undefined, // gen_ai.* fields are filtered out
    });
    expect(result.input.messages[1]).toEqual({
      role: "user",
      content: "What is the capital of Italy?",
      json: undefined,
    });

    expect(result.output.messages).toHaveLength(1);
    expect(result.output.messages[0]).toEqual({
      role: "assistant",
      content: "Rome",
      json: undefined,
    });
  });

  it("should preserve custom fields in json", () => {
    const input = [
      {
        content: "Test",
        role: "user",
        "gen_ai.system": "openai",
        "event.name": "gen_ai.user.message",
        custom_field: "preserved",
        another_field: 123,
      },
    ];

    const result = pydanticMapper.map(input, null);

    expect(result.input.messages[0].json).toEqual({
      custom_field: "preserved",
      another_field: 123,
    });
  });

  it("should handle empty input/output", () => {
    const result1 = pydanticMapper.map([], null);
    expect(result1.input.messages).toHaveLength(0);
    expect(result1.output.messages).toHaveLength(0);

    const result2 = pydanticMapper.map(null, {});
    expect(result2.input.messages).toHaveLength(0);
    expect(result2.output.messages).toHaveLength(0);
  });

  it("should extract assistant message from nested message field", () => {
    const output = {
      index: 0,
      message: {
        role: "assistant",
        content: "Nested response",
        custom_field: "test",
      },
      "gen_ai.system": "openai",
      "event.name": "gen_ai.choice",
    };

    const result = pydanticMapper.map(null, output);

    expect(result.output.messages).toHaveLength(1);
    expect(result.output.messages[0]).toEqual({
      role: "assistant",
      content: "Nested response",
      json: { custom_field: "test" },
    });
  });
});
