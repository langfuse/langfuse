import { render, cleanup } from "@testing-library/react";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";

const markdownViewSpy = vi.fn(() => <div data-testid="markdown-view" />);

vi.mock("@/src/components/ui/MarkdownViewer", () => ({
  MarkdownView: (props: unknown) => markdownViewSpy(props),
}));

afterEach(() => {
  cleanup();
  markdownViewSpy.mockClear();
});

describe("MarkdownJsonView", () => {
  it("passes raw multimodal content to MarkdownView so media references stay renderable", () => {
    const content = [
      { type: "text", text: "before" },
      {
        type: "image_url",
        image_url: {
          url: "@@@langfuseMedia:type=image/png|id=media-1|source=base64_data_uri@@@",
        },
      },
    ] as const;

    render(<MarkdownJsonView content={content} title="Input" />);

    expect(markdownViewSpy).toHaveBeenCalledTimes(1);
    expect(markdownViewSpy.mock.calls[0]?.[0]).toMatchObject({
      markdown: content,
    });
    expect(
      (markdownViewSpy.mock.calls[0]?.[0] as { markdown: typeof content })
        .markdown[1],
    ).toEqual(content[1]);
  });
});
