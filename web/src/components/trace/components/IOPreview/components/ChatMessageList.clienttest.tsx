import { cleanup, render, screen } from "@testing-library/react";
import { ChatMessageList } from "./ChatMessageList";

const sectionMediaSpy = vi.fn(() => <div data-testid="section-media" />);

vi.mock("./ChatMessage", () => ({
  ChatMessage: () => <div data-testid="chat-message" />,
}));

vi.mock("./SectionMedia", () => ({
  SectionMedia: (props: unknown) => sectionMediaSpy(props),
}));

afterEach(() => {
  cleanup();
  sectionMediaSpy.mockClear();
});

describe("ChatMessageList", () => {
  it("dedupes media already rendered inline from multimodal content", () => {
    const mediaReference =
      "@@@langfuseMedia:type=image/png|id=media-1|source=base64_data_uri@@@";

    render(
      <ChatMessageList
        messages={
          [
            {
              role: "user",
              content: [
                { type: "text", text: "before" },
                { type: "image_url", image_url: { url: mediaReference } },
              ],
            },
          ] as any
        }
        shouldRenderMarkdown={true}
        media={
          [
            {
              mediaId: "media-1",
              contentType: "image/png",
              contentLength: 1,
              url: "https://example.com/media-1.png",
              urlExpiry: "2099-01-01T00:00:00.000Z",
              field: "input",
            },
          ] as any
        }
        currentView="pretty"
        messageToToolCallNumbers={new Map()}
      />,
    );

    expect(screen.queryByTestId("section-media")).not.toBeInTheDocument();
    expect(sectionMediaSpy).not.toHaveBeenCalled();
  });
});
