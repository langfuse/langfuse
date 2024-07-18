import { ModelUsageUnit } from "@langfuse/shared";
import { tokenCount } from "@/src/features/ingest/lib/usage";

describe("Token Count Functions", () => {
  const generateModel = (model: string, tokenizer: string) => {
    return {
      id: "1",
      modelName: model,
      tokenizerId: tokenizer,
      tokenizerConfig: {
        tokensPerMessage: 3,
        tokensPerName: 1,
        tokenizerModel: model,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      matchPattern: "",
      projectId: null,
      startDate: null,
      inputPrice: null,
      outputPrice: null,
      totalPrice: null,
      unit: ModelUsageUnit.Tokens,
    };
  };

  describe("token count for strings", () => {
    [
      { model: "gpt-3.5-turbo", tokenizer: "openai", tokens: 114 },
      { model: "text-embedding-ada-002", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4-1106-preview", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4-vision-preview", tokenizer: "openai", tokens: 114 },
      { model: "claude", tokenizer: "claude", tokens: 118 },
      { model: "claude-instant-1.2", tokenizer: "claude", tokens: 118 },
      { model: "gpt-3.5-turbo-1106", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4o-2024-05-13", tokenizer: "openai", tokens: 112 },
    ].forEach(({ model, tokens, tokenizer }) => {
      it(`should return token count ${tokens} for ${model}`, () => {
        const result = tokenCount({
          model: generateModel(model, tokenizer),
          text: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.",
        });
        expect(result).toBeDefined();
        expect(result).toBe(tokens);
      });
    });

    it("should return undefined for unknown model", () => {
      const result = tokenCount({
        model: generateModel("unknown-model", "unknown-tokenizer"),
        text: "Hello, World!",
      });
      expect(result).toBeUndefined();
    });

    it("check extensive openai chat message", () => {
      const result = tokenCount({
        model: generateModel("gpt-3.5-turbo", "openai"),
        text: [
          {
            role: "system",
            content: "some test",
            id: "some-id",
            isPersisted: true,
          },
          {
            id: "some-id",
            content: "some test",
            role: "user",
            timestamp: "2024-01-00:00:00.488Z",
            isPersisted: true,
          },
          {
            id: "some id",
            content:
              "Hey Simon! 😊 How's your day going? Have you been up to anything interesting lately?",
            role: "user",
            timestamp: "2024-01-24T10:00:00.929Z",
            isPersisted: true,
          },
          {
            content: true,
            role: "user",
            id: "some id",
          },
          {
            role: "system",
            content: "This is some content",
          },
          {
            id: "another id",
            role: "assistant",
            content: "This is some content",
          },
        ],
      });
      expect(result).toBe(155);
    });

    it("should return for invalid text type", () => {
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
        text: 1234,
      });
      expect(result).toBe(2);
    });

    it("should return correct token count for empty string", () => {
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
        text: "",
      });
      expect(result).toBe(0);
    });

    it("should return correct token count for very long string", () => {
      const longString = "A".repeat(10000);
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
        text: longString,
      });
      expect(result).toBeDefined();
      expect(result).toBe(1250);
    });

    it("should return undefined for null text input", () => {
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
        text: null,
      });
      expect(result).toBeUndefined();
    });
    it("should return undefined for undefined text input", () => {
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
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
          model: generateModel(model, tokenizer),
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
        model: generateModel("gpt-4", "openai"),
        text: { role: "Helo world" },
      });
      expect(result).toBe(7);
    });

    it("should return for empty array", () => {
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
        text: [],
      });
      expect(result).toBeUndefined();
    });

    it("should return for array of invalid object", () => {
      const result = tokenCount({
        model: generateModel("gpt-4", "openai"),
        text: [{ role: "Helo world" }],
      });
      expect(result).toBe(9);
    });
  });
});
