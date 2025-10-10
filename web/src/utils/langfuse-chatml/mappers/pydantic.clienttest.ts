import { pydanticMapper } from "./pydantic";
import { MAPPER_SCORE_DEFINITIVE, MAPPER_SCORE_NONE } from "./base";

describe("pydanticMapper", () => {
  it("should detect Pydantic AI via metadata and structural indicators", () => {
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

    expect(pydanticMapper.canMapScore({}, {}, metadata)).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(
      pydanticMapper.canMapScore(
        {},
        {},
        { attributes: { "gen_ai.system": "openai" } },
      ),
    ).toBe(MAPPER_SCORE_NONE);

    // Structural detection: gen_ai.* and event.name fields
    const inputWithStructure = [
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

    const outputWithStructure = {
      index: 0,
      message: {
        role: "assistant",
        content: "Rome",
      },
      "gen_ai.system": "openai",
      "event.name": "gen_ai.choice",
    };

    expect(
      pydanticMapper.canMapScore(inputWithStructure, null),
    ).toBeGreaterThan(0);
    expect(
      pydanticMapper.canMapScore(null, outputWithStructure),
    ).toBeGreaterThan(0);

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

  it("should map Pydantic AI format and handle nested messages", () => {
    // Basic mapping with gen_ai.* field filtering
    const input1 = [
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
        custom_field: "preserved",
        another_field: 123,
      },
    ];

    const output1 = {
      index: 0,
      message: {
        role: "assistant",
        content: "Rome",
      },
      "gen_ai.system": "openai",
      "event.name": "gen_ai.choice",
    };

    const result1 = pydanticMapper.map(input1, output1);
    expect(result1.input.messages).toHaveLength(2);
    expect(result1.input.messages[0]).toEqual({
      role: "system",
      name: undefined,
      content: "You are a helpful assistant.",
      json: undefined,
    });
    expect(result1.input.messages[1].json).toEqual({
      custom_field: "preserved",
      another_field: 123,
    });
    expect(result1.output.messages).toHaveLength(1);
    expect(result1.output.messages[0]).toEqual({
      role: "assistant",
      name: undefined,
      content: "Rome",
      json: undefined,
    });

    // Extract nested message with custom fields
    const output2 = {
      index: 0,
      message: {
        role: "assistant",
        content: "Nested response",
        custom_field: "test",
      },
      "gen_ai.system": "openai",
      "event.name": "gen_ai.choice",
    };

    const result2 = pydanticMapper.map(null, output2);
    expect(result2.output.messages).toHaveLength(1);
    expect(result2.output.messages[0]).toEqual({
      role: "assistant",
      name: undefined,
      content: "Nested response",
      json: { custom_field: "test" },
    });
  });
});
