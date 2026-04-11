import {
  getSpielwiesePromptPreviewText,
  normalizeSpielwiesePromptPreviewText,
} from "./spielwiesePromptPreview";

const mockLayoutNextLine = jest.fn();
const mockPrepareWithSegments = jest.fn((text: string) => ({
  segments: [text],
}));

jest.mock("@chenglou/pretext", () => ({
  layoutNextLine: (...args: unknown[]) => mockLayoutNextLine(...args),
  prepareWithSegments: (...args: unknown[]) => mockPrepareWithSegments(...args),
}));

const previewMetrics = {
  font: '500 12px "Geist Mono", monospace',
  width: 160,
};

describe("spielwiesePromptPreview", () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;

  beforeEach(() => {
    globalThis.OffscreenCanvas = class MockOffscreenCanvas {} as never;
    mockLayoutNextLine.mockReset();
    mockPrepareWithSegments.mockClear();
  });

  afterAll(() => {
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  });

  it("normalizes prompt text into a single compact line", () => {
    expect(
      normalizeSpielwiesePromptPreviewText(
        "You are a food identification expert.\n\nIdentify every item.",
      ),
    ).toBe("You are a food identification expert. Identify every item.");
  });

  it("adds a three-dot suffix when pretext reports overflow", () => {
    mockLayoutNextLine
      .mockReturnValueOnce({
        end: { graphemeIndex: 0, segmentIndex: 0 },
        start: { graphemeIndex: 0, segmentIndex: 0 },
        text: "You are a food identification expert",
        width: 140,
      })
      .mockReturnValueOnce({
        end: { graphemeIndex: 0, segmentIndex: 1 },
        start: { graphemeIndex: 0, segmentIndex: 0 },
        text: "...",
        width: 14,
      })
      .mockReturnValueOnce({
        end: { graphemeIndex: 0, segmentIndex: 0 },
        start: { graphemeIndex: 0, segmentIndex: 0 },
        text: "You are a food identification",
        width: 126,
      });

    expect(
      getSpielwiesePromptPreviewText(
        "You are a food identification expert. Identify every food item in the image.",
        previewMetrics,
      ),
    ).toBe("You are a food identification...");
  });

  it("keeps the full line when pretext says it fits", () => {
    mockLayoutNextLine.mockReturnValueOnce({
      end: { graphemeIndex: 0, segmentIndex: 1 },
      start: { graphemeIndex: 0, segmentIndex: 0 },
      text: "[JSON from Step 1]",
      width: 92,
    });

    expect(
      getSpielwiesePromptPreviewText("[JSON from Step 1]", previewMetrics),
    ).toBe("[JSON from Step 1]");
  });
});
