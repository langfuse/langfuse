import { describe, expect, it } from "vitest";

import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
  type PlaceholderMessage,
} from "@langfuse/shared";

import { resolveJumpTargetWindowId } from "./resolveJumpTargetWindowId";

const message = (content: string, id = "generated-on-hydration"): ChatMessage =>
  ({
    id,
    type: ChatMessageType.System,
    role: ChatMessageRole.System,
    content,
  }) as ChatMessage;

const stableWindowId = "playground-prompt-abc";
const incomingMessages = [message("You are a helpful assistant")];
const storedPrompt = [message("You are a helpful assistant", "other-id")];
const editedPrompt = [message("You are a pirate")];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const caches = (
  entries: Record<string, (ChatMessage | PlaceholderMessage)[]>,
) => ({
  openWindowIds: Object.keys(entries),
  getCachedMessages: (windowId: string) => entries[windowId],
});

describe("resolveJumpTargetWindowId", () => {
  it("addresses the stable window whenever nothing would be lost", () => {
    // Not open at all.
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: ["some-other-window"],
        incomingMessages,
        getCachedMessages: () => editedPrompt,
      }),
    ).toBe(stableWindowId);

    // Open and still holding the stored prompt. Message ids are assigned on
    // hydration, so they must not count towards the comparison.
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingMessages,
        ...caches({ [stableWindowId]: storedPrompt }),
      }),
    ).toBe(stableWindowId);

    // Open with nothing cached yet.
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: [stableWindowId],
        incomingMessages,
        getCachedMessages: () => undefined,
      }),
    ).toBe(stableWindowId);
  });

  it("mints a sibling once the stable window is edited, then jumps back into it", () => {
    const edited = { [stableWindowId]: editedPrompt };

    const siblingId = resolveJumpTargetWindowId({
      stableWindowId,
      incomingMessages,
      ...caches(edited),
    });

    expect(siblingId).toMatch(new RegExp(`^${stableWindowId}-${UUID}$`));

    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingMessages,
        ...caches({
          ...edited,
          [`${stableWindowId}-def`]: storedPrompt,
          [siblingId]: storedPrompt,
        }),
      }),
    ).toBe(siblingId);
  });
});
