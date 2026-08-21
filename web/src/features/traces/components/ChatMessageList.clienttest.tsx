import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// The dedup under test lives in ChatMessageList; stub the per-message renderer
// and the media strip to observe only which media survive the filter.
vi.mock(
  "@/src/features/traces/components/IOPreview/components/ChatMessage",
  () => ({
    ChatMessage: () => <div data-testid="chat-message" />,
  }),
);
vi.mock(
  "@/src/features/traces/components/IOPreview/components/SectionMedia",
  () => ({
    SectionMedia: ({ media }: { media: { mediaId: string }[] }) => (
      <div
        data-testid="section-media"
        data-media-ids={media.map((m) => m.mediaId).join(",")}
      />
    ),
  }),
);

import { ChatMessageList } from "@/src/features/traces/components/ChatMessageList";
import { type ChatMlMessage } from "@/src/features/traces/fns/chatMessageUtils";
import { type MediaReturnType } from "@/src/features/media/validation";

// Pin the limit so the test does not depend on the ambient .env value.
const { TEST_LIMIT } = vi.hoisted(() => ({ TEST_LIMIT: 1_000 }));
vi.mock("@/src/hooks/useMarkdownRenderCharacterLimit", () => ({
  useMarkdownRenderCharacterLimit: () => TEST_LIMIT,
}));

const MEDIA_REF = "@@@langfuseMedia:type=image/png|id=media-1|source=base64@@@";

const media = [{ mediaId: "media-1" } as MediaReturnType];

const renderList = (content: string) =>
  render(
    <ChatMessageList
      messages={[{ role: "user", content } as ChatMlMessage]}
      shouldRenderMarkdown={true}
      media={media}
      currentView="pretty"
      messageToToolCallNumbers={new Map()}
    />,
  );

describe("ChatMessageList media dedup", () => {
  it("filters media that the markdown path renders inline", () => {
    renderList(MEDIA_REF);

    expect(screen.queryByTestId("section-media")).not.toBeInTheDocument();
  });

  it("keeps media in the strip when over-limit content falls back to JSON", () => {
    // Over the limit, the renderer falls back to a JSON view with no inline media.
    const overLimit = MEDIA_REF.repeat(
      Math.ceil((TEST_LIMIT + 1) / MEDIA_REF.length),
    );

    renderList(overLimit);

    expect(screen.getByTestId("section-media")).toHaveAttribute(
      "data-media-ids",
      "media-1",
    );
  });

  it("keeps audio media in the strip when its message falls back to JSON", () => {
    // The JSON fallback for non-renderable content shows neither the content's
    // media nor the message audio inline.
    render(
      <ChatMessageList
        messages={[
          {
            role: "assistant",
            content: "x".repeat(TEST_LIMIT + 1),
            audio: {
              data: {
                id: "media-audio-1",
                type: "audio/wav",
                source: "base64",
                referenceString:
                  "@@@langfuseMedia:type=audio/wav|id=media-audio-1|source=base64@@@",
              },
            },
          } as unknown as ChatMlMessage,
        ]}
        shouldRenderMarkdown={true}
        media={[{ mediaId: "media-audio-1" } as MediaReturnType]}
        currentView="pretty"
        messageToToolCallNumbers={new Map()}
      />,
    );

    expect(screen.getByTestId("section-media")).toHaveAttribute(
      "data-media-ids",
      "media-audio-1",
    );
  });
});
