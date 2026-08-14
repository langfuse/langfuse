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
    const overLimit = MEDIA_REF.repeat(Math.ceil(150_001 / MEDIA_REF.length));

    renderList(overLimit);

    expect(screen.getByTestId("section-media")).toHaveAttribute(
      "data-media-ids",
      "media-1",
    );
  });
});
