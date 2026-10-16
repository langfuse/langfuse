import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// The list logic under test lives in ChatMessageList; stub the per-message
// renderer (recording its collapse default) and the media strip.
vi.mock(
  "@/src/features/traces/components/IOPreview/components/ChatMessage",
  () => ({
    ChatMessage: ({
      message,
      defaultCollapsed,
    }: {
      message: { role: string };
      defaultCollapsed?: boolean;
    }) => (
      <div
        data-testid="chat-message"
        data-role={message.role}
        data-collapsed={String(defaultCollapsed)}
      />
    ),
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
import { type MediaReturnType } from "@/src/features/media";
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

describe("ChatMessageList long history", () => {
  const conversation = [
    { role: "system", content: "Be brief." },
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "user", content: "three" },
    { role: "assistant", content: "four" },
    { role: "user", content: "five" },
  ] as ChatMlMessage[];

  const collapsedFlags = () =>
    screen
      .getAllByTestId("chat-message")
      .map((el) => el.getAttribute("data-collapsed"));

  it("starts earlier messages collapsed and keeps the last three open", () => {
    render(
      <ChatMessageList
        messages={conversation}
        shouldRenderMarkdown={true}
        currentView="pretty"
        messageToToolCallNumbers={new Map()}
      />,
    );

    // system follows its own long-prompt rule, so it is left open here
    expect(collapsedFlags()).toEqual([
      "false",
      "true",
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  it("leaves every message open when history collapsing is off", () => {
    render(
      <ChatMessageList
        messages={conversation}
        shouldRenderMarkdown={true}
        currentView="pretty"
        messageToToolCallNumbers={new Map()}
        collapseLongHistory={false}
      />,
    );

    expect(collapsedFlags()).toEqual(Array(6).fill("false"));
  });
});

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
