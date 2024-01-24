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
      unit: "TOKENS",
    };
  };

  describe("token count for strings", () => {
    [
      { model: "gpt-3.5-turbo", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4-1106-preview", tokenizer: "openai", tokens: 114 },
      { model: "gpt-4-vision-preview", tokenizer: "openai", tokens: 114 },
      { model: "claude", tokenizer: "claude", tokens: 118 },
      { model: "claude-instant-1.2", tokenizer: "claude", tokens: 118 },
      { model: "gpt-3.5-turbo-1106", tokenizer: "openai", tokens: 114 },
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

    it("huhu", () => {
      const result = tokenCount({
        model: generateModel("gpt-3.5-turbo", "openai"),
        text: [
          {
            role: "system",
            content:
              "Your name is Spidey. You are an assistant for a UK FE college helping students select the best course for them. You keep your responses concise. Always following British English spellings. You don't allow conversations to go off topic away from what the FE college offers.",
            id: "d4f7fb3e-d573-46a8-989e-0298a23fe548",
            isPersisted: true,
          },
          {
            id: "b6e3eec0-8cf8-4fb6-9413-2dcd76156255",
            content: "Which course should I choose?",
            role: "user",
            timestamp: "2024-01-24T10:50:11.488Z",
            isPersisted: true,
          },
          {
            id: "c7beb2d7-5899-4ad0-9052-c1875b480612",
            content: "Which course should I choose?",
            role: "user",
            timestamp: "2024-01-24T10:51:16.929Z",
            isPersisted: true,
          },
          {
            content: true,
            role: "user",
            id: "urPmjcU",
          },
          {
            role: "system",
            content:
              "Directive: Sorry, I`m only able to help with queries relating to this FE college website.",
          },
          {
            id: "5ff14238-e340-47b0-9b5e-f2b7e484644b",
            role: "assistant",
            content:
              "I apologize, but I can only assist with queries related to courses offered at this FE college.",
          },
        ],
      });
      expect(result).toBe(316);
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
