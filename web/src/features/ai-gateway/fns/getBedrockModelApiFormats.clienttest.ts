import { describe, expect, it } from "vitest";
import { getBedrockModelApiFormats } from "./getBedrockModelApiFormats";

describe("getBedrockModelApiFormats", () => {
  it("follows the model cards for known models and allows unknown ones", () => {
    expect(
      getBedrockModelApiFormats("meta.llama3-3-70b-instruct-v1:0"),
    ).toEqual([]);
    expect(
      getBedrockModelApiFormats(
        "us.anthropic.claude-3-haiku-20240307-v1:0:200k",
      ),
    ).toEqual([]);
    expect(getBedrockModelApiFormats("openai.gpt-oss-120b-1:0")).toEqual([
      "openai.chat-completions",
    ]);
    expect(
      getBedrockModelApiFormats("global.anthropic.claude-opus-4-8"),
    ).toEqual(["anthropic.messages"]);
    expect(getBedrockModelApiFormats("anthropic.claude-next")).toEqual([
      "anthropic.messages",
    ]);
    expect(getBedrockModelApiFormats("newvendor.model-1")).toEqual([
      "openai.responses",
      "openai.chat-completions",
    ]);
  });
});
