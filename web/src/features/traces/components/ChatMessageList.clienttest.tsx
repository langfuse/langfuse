import { fireEvent, render, screen } from "@testing-library/react";
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
import {
  type ChatMlMessage,
  getMessageTitle,
} from "@/src/features/traces/fns/chatMessageUtils";
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
      getMessageTitle={getMessageTitle}
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
        getMessageTitle={getMessageTitle}
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

  const longConversation = [
    { role: "system", content: "Be brief." },
    ...Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i + 1}`,
    })),
  ] as ChatMlMessage[];

  const renderLong = (messages: ChatMlMessage[]) =>
    render(
      <ChatMessageList
        messages={messages}
        shouldRenderMarkdown={true}
        currentView="pretty"
        messageToToolCallNumbers={new Map()}
        getMessageTitle={getMessageTitle}
      />,
    );

  it("shows no fold row for six or fewer messages", () => {
    renderLong(conversation);

    expect(
      screen.queryByRole("button", { name: /other message/ }),
    ).not.toBeInTheDocument();
  });

  it("folds the middle of a long chat behind one row until it is opened", () => {
    renderLong(longConversation);

    // 8 rendered: first + 4 folded + last 3
    const row = screen.getByRole("button", { name: "4 other messages" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByTestId("chat-message")).toHaveLength(4);
    expect(collapsedFlags()).toEqual(["false", "false", "false", "false"]);
    const list = row.parentElement!;
    expect(Array.from(list.children).indexOf(row)).toBe(1);

    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByTestId("chat-message")).toHaveLength(8);
    // the revealed messages start collapsed; first and last three stay open
    expect(collapsedFlags()).toEqual([
      "false",
      "true",
      "true",
      "true",
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(Array.from(list.children).indexOf(row)).toBe(1);

    fireEvent.click(row);
    expect(screen.getAllByTestId("chat-message")).toHaveLength(4);
  });

  it("does not count an empty message toward the tail", () => {
    renderLong([
      ...longConversation.slice(0, 6),
      { role: "assistant" } as ChatMlMessage,
      ...longConversation.slice(6),
    ]);

    // the empty message never renders, so the fold still hides 4 and shows the
    // last three real messages
    expect(
      screen.getByRole("button", { name: "4 other messages" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByTestId("chat-message")
        .map((el) => el.getAttribute("data-role")),
    ).toEqual(["system", "user", "assistant", "user"]);
  });

  it("leaves every message open when history collapsing is off", () => {
    render(
      <ChatMessageList
        messages={conversation}
        shouldRenderMarkdown={true}
        currentView="pretty"
        messageToToolCallNumbers={new Map()}
        getMessageTitle={getMessageTitle}
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
