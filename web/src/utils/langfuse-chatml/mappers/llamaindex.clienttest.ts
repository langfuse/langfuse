import { llamaIndexMapper } from "./llamaindex";
import { MAPPER_SCORE_DEFINITIVE } from "./base";

describe("LlamaIndex Mapper", () => {
  it("should detect LlamaIndex via metadata scope.name", () => {
    const metadata = {
      attributes: {
        "llm.model_name": "gpt-4o",
        "llm.provider": "openai",
        "llm.prompts": ["What is Langfuse?"],
        "openinference.span.kind": "LLM",
      },
      scope: {
        name: "openinference.instrumentation.llama_index",
        version: "4.3.0",
      },
    };

    expect(llamaIndexMapper.canMapScore({}, {}, metadata)).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
  });

  it("should map LlamaIndex format to ChatML", () => {
    const input = {
      args: ["What is Langfuse?"],
    };

    const output =
      "Langfuse is a tool designed to help developers monitor and debug applications that utilize large language models (LLMs).";

    const metadata = {
      attributes: {
        "llm.model_name": "gpt-4o",
        "llm.provider": "openai",
        "llm.prompts": ["What is Langfuse?"],
        "output.value": output,
        "openinference.span.kind": "LLM",
      },
      scope: {
        name: "openinference.instrumentation.llama_index",
        version: "4.3.0",
      },
    };

    const result = llamaIndexMapper.map(input, output, metadata);

    expect(result.input.messages).toHaveLength(1);
    expect(result.input.messages[0]).toEqual({
      role: "user",
      name: undefined,
      content: "What is Langfuse?",
    });

    expect(result.output.messages).toHaveLength(1);
    expect(result.output.messages[0]).toEqual({
      role: "assistant",
      name: undefined,
      content: output,
    });

    expect(result.canDisplayAsChat()).toBe(true);
  });
});
