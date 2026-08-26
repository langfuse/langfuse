import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// The dedup under test lives in ChatMessageList; stub the per-message renderer
// and the media strip to observe only which media survive the filter.
vi.mock(
  "@/src/features/traces/components/IOPreview/components/ChatMessage",
  () => ({
    ChatMessage: () => null,
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
const AUDIO_REF = "@@@langfuseMedia:type=audio/wav|id=audio-1|source=base64@@@";

const renderList = (message: ChatMlMessage, mediaIds: string[]) =>
  render(
    <ChatMessageList
      messages={[message]}
      shouldRenderMarkdown={true}
      media={mediaIds.map((mediaId) => ({ mediaId }) as MediaReturnType)}
      currentView="pretty"
      messageToToolCallNumbers={new Map()}
    />,
  );

describe("ChatMessageList media dedup", () => {
  it("filters media that the markdown path renders inline", () => {
    renderList({ role: "user", content: MEDIA_REF } as ChatMlMessage, [
      "media-1",
    ]);

    expect(screen.queryByTestId("section-media")).not.toBeInTheDocument();
  });

  it("keeps referenced media and audio when over-limit content falls back to JSON", () => {
    renderList(
      {
        role: "assistant",
        content: MEDIA_REF.repeat(
          Math.ceil((TEST_LIMIT + 1) / MEDIA_REF.length),
        ),
        audio: {
          data: {
            type: "base64",
            id: "audio-1",
            source: "",
            referenceString: AUDIO_REF,
          },
        },
      } as ChatMlMessage,
      ["media-1", "audio-1"],
    );

    expect(screen.getByTestId("section-media")).toHaveAttribute(
      "data-media-ids",
      "media-1,audio-1",
    );
  });
});
