import { tokenCount } from "@/src/features/ingest/lib/usage";

describe("Token Count Functions", () => {
  describe("token count for strings", () => {
    [
      { model: "gpt-3.5", tokenizer: "openai", tokens: 114 },
      { model: "gpt-35", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4-1106-preview", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4-vision-preview", tokenizer: "openai", tokens: 114 },
      { model: "claude", tokenizer: "claude", tokens: 118 },
      { model: "claude-instant-1.2", tokenizer: "claude", tokens: 118 },
      { model: "gpt-3.5-turbo-1106", tokenizer: "openai", tokens: 114 },
      { model: "gpt-35-turbo-1106", tokenizer: "openai", tokens: 114 },
    ].forEach(({ model, tokens, tokenizer }) => {
      it(`should return token count ${tokens} for ${model}`, () => {
        const result = tokenCount({
          internalModel: model,
          tokenizer: tokenizer,
          text: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.",
        });
        expect(result).toBeDefined();
        expect(result).toBe(tokens);
      });
    });

    it("should return undefined for unknown model", () => {
      const result = tokenCount({
        internalModel: "unknown-model",
        tokenizer: "unknown-tokenizer",
        text: "Hello, World!",
      });
      expect(result).toBeUndefined();
    });

    it("should return for invalid text type", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: 1234,
      });
      expect(result).toBe(2);
    });

    it("should return correct token count for empty string", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: "",
      });
      expect(result).toBe(0);
    });

    it("should return correct token count for very long string", () => {
      const longString = "A".repeat(10000);
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: longString,
      });
      expect(result).toBeDefined();
      expect(result).toBe(1250);
    });

    it("should return undefined for null text input", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: null,
      });
      expect(result).toBeUndefined();
    });
    it("should return undefined for undefined text input", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: undefined,
      });
      expect(result).toBeUndefined();
    });
  });

  describe("token count for chat messages", () => {
    [
      { model: "gpt-4", tokenizer: "openai", tokens: 44 },
      { model: "gpt-3.5-turbo-16k-0613", tokenizer: "openai", tokens: 44 },
      { model: "gpt-3.5-turbo-16k-0613", tokenizer: "openai", tokens: 44 },
      { model: "claude-instant-1.2", tokenizer: "claude", tokens: 48 },
    ].forEach(({ model, tokens, tokenizer }) => {
      it(`should return token count ${tokens} for ${model}`, () => {
        const result = tokenCount({
          internalModel: model,
          tokenizer: tokenizer,
          text: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Who won the world series in 2020?" },
            {
              role: "assistant",
              content: "The Los Angeles Dodgers won the World Series in 2020.",
            },
          ],
        });
        expect(result).toBeDefined();
        expect(result).toBe(tokens);
      });
    });

    it("should return for non array", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: { role: "Helo world" },
      });
      expect(result).toBe(7);
    });

    it("should return for empty array", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: [],
      });
      expect(result).toBeUndefined();
    });

    it("should return for array of invalid object", () => {
      const result = tokenCount({
        internalModel: "gpt-4",
        tokenizer: "openai",
        text: [{ role: "Helo world" }],
      });
      expect(result).toBe(9);
    });
  });
});
