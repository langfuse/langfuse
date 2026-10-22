import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stands in for the real media renderer (it needs a session + signed-URL
// query); the contract under test is which reference reaches it.
vi.mock("@/src/components/ui/LangfuseMediaView", () => ({
  LangfuseMediaView: ({
    mediaReferenceString,
  }: {
    mediaReferenceString?: unknown;
  }) => (
    <div
      data-testid="langfuse-media"
      data-media-ref={
        typeof mediaReferenceString === "string"
          ? mediaReferenceString
          : (mediaReferenceString as { referenceString?: string })
              ?.referenceString
      }
    />
  ),
}));

import { ChatMlArraySchema } from "@langfuse/shared";
import { ChatMessage } from "./ChatMessage";
import { type IOPreviewContentMode } from "../IOPreview";
import { type ChatMlMessage } from "../../../fns/chatMessageUtils";

function renderChatMessage(
  message: ChatMlMessage,
  { contentMode = "all" }: { contentMode?: IOPreviewContentMode } = {},
) {
  return render(
    <ChatMessage
      message={message}
      shouldRenderMarkdown
      currentView="pretty"
      contentMode={contentMode}
    />,
  );
}

describe("ChatMessage content modes", () => {
  it("keeps assistant content but removes tool details in conversation mode", () => {
    renderChatMessage(
      {
        role: "assistant",
        content: "I will check that for you.",
        tool_calls: [
          { id: "call-1", name: "search_traces", arguments: '{"limit":10}' },
        ],
      } as unknown as ChatMlMessage,
      { contentMode: "conversation" },
    );

    expect(
      screen.getAllByText("I will check that for you.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("search_traces")).not.toBeInTheDocument();
  });
});

describe("ChatMessage media content parts", () => {
  const mediaId = "abc123def456ghi789jkl0";
  const referenceString = `@@@langfuseMedia:type=image/png|id=${mediaId}|source=base64_data_uri@@@`;

  // LFE-14815 / LFE-13602: OpenAIContentSchema's url union parses the media
  // reference into an object, so a renderer re-validating the untransformed
  // schema drops the part silently.
  it("renders an image_url part carrying a langfuse media reference", () => {
    renderChatMessage({
      role: "user",
      content: [
        { type: "text", text: "here is the thermostat" },
        { type: "image_url", image_url: { url: referenceString } },
      ],
    } as unknown as ChatMlMessage);

    expect(screen.getByText("here is the thermostat")).toBeInTheDocument();
    expect(screen.getByTestId("langfuse-media")).toHaveAttribute(
      "data-media-ref",
      referenceString,
    );
  });

  it("renders an AI SDK file part carrying a langfuse media reference", () => {
    renderChatMessage({
      role: "user",
      content: [
        { type: "text", text: "attached report" },
        { type: "file", data: referenceString, mediaType: "image/png" },
      ],
    } as unknown as ChatMlMessage);

    expect(screen.getByText("attached report")).toBeInTheDocument();
    expect(screen.getByTestId("langfuse-media")).toHaveAttribute(
      "data-media-ref",
      referenceString,
    );
  });

  // LFE-9577: a single reference string renders inline, and so do several in
  // one string — but an ARRAY of bare references failed OpenAIContentParts
  // (which only accepted `{type, …}` objects) and dropped to a JSON table.
  it("renders an array of bare media reference strings inline", () => {
    const second = referenceString.replace(mediaId, "zzz987yxw654vut321srq0");
    renderChatMessage({
      role: "user",
      content: [referenceString, second],
    } as unknown as ChatMlMessage);

    expect(
      screen
        .getAllByTestId("langfuse-media")
        .map((el) => el.getAttribute("data-media-ref")),
    ).toEqual([referenceString, second]);
  });

  // The ChatML transform materializes all 10 schema keys, so a message that
  // normalized to `{}` used to table out one `undefined` row per key.
  it("renders nothing for a parsed message that carries no data", () => {
    const parsed = ChatMlArraySchema.parse([{}]);
    const { container } = renderChatMessage(parsed[0] as ChatMlMessage);
    expect(container).toBeEmptyDOMElement();
  });

  // Same materialized keys, but this shape has one real field so it still
  // renders through the whole-message fallback table.
  it("omits unset ChatML keys from the fallback table", () => {
    const parsed = ChatMlArraySchema.parse([
      { role: "user", name: "Agent", content: "" },
    ]);
    renderChatMessage(parsed[0] as ChatMlMessage);

    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.queryByText("tool_call_id")).not.toBeInTheDocument();
  });
});
