import { tokenCount } from "@/src/features/ingest/lib/usage";

describe("Token Count Functions", () => {
  describe("token count for strings", () => {
    [
      { model: "gpt-3.5", tokens: 114 },
      { model: "claude", tokens: 118 },
    ].forEach(({ model, tokens }) => {
      it(`should return token count ${tokens} for ${model}`, () => {
        const result = tokenCount({
          model: model,
          text: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.",
        });
        expect(result).toBeDefined();
        expect(result).toBe(tokens); // You can replace with the actual expected count if known
      });
    });

    it("should return undefined for unknown model", () => {
      const result = tokenCount({
        model: "unknown-model",
        text: "Hello, World!",
      });
      expect(result).toBeUndefined();
    });

    it("should return for invalid text type", () => {
      const result = tokenCount({ model: "gpt-4", text: 1234 });
      expect(result).toBe(2);
    });
  });

  describe("token count for chat messages", () => {
    [
      { model: "gpt-4", tokens: 44 },
      { model: "gpt-3.5-turbo-16k-0613", tokens: 47 },
    ].forEach(({ model, tokens }) => {
      it(`should return token count ${tokens} for ${model}`, () => {
        const result = tokenCount({
          model: model,
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
        expect(result).toBe(44);
      });
    });

    it("should return for non array", () => {
      const result = tokenCount({
        model: "gpt-4",
        text: { role: "Helo world" },
      });
      expect(result).toBe(7);
    });

    it("should return for array of invalid object", () => {
      const result = tokenCount({
        model: "gpt-4",
        text: [{ role: "Helo world" }],
      });
      expect(result).toBe(9);
    });
  });
});
