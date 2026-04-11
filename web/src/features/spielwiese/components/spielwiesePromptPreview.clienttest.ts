import {
  getSpielwiesePromptPreviewText,
  normalizeSpielwiesePromptPreviewText,
} from "./spielwiesePromptPreview";

describe("spielwiesePromptPreview", () => {
  it("normalizes prompt text into a single compact line", () => {
    expect(
      normalizeSpielwiesePromptPreviewText(
        "You are a food identification expert.\n\nIdentify every item.",
      ),
    ).toBe("You are a food identification expert. Identify every item.");
  });

  it("keeps the full normalized line instead of width-based truncation", () => {
    expect(
      getSpielwiesePromptPreviewText(
        "You are a food identification expert. Identify every food item in the image.",
      ),
    ).toBe(
      "You are a food identification expert. Identify every food item in the image.",
    );
  });
});
