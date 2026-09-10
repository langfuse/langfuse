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

const caches = (
  entries: Record<string, (ChatMessage | PlaceholderMessage)[]>,
) => ({
  openWindowIds: Object.keys(entries),
  getCachedMessages: (windowId: string) => entries[windowId],
});

describe("resolveJumpTargetWindowId", () => {
  it("addresses the stable window while it is not open", () => {
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: ["some-other-window"],
        incomingMessages,
        getCachedMessages: () => [message("You are a pirate")],
      }),
    ).toBe(stableWindowId);
  });

  it("reuses the stable window while it still holds the stored prompt", () => {
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingMessages,
        ...caches({
          [stableWindowId]: [
            message("You are a helpful assistant", "other-id"),
          ],
        }),
      }),
    ).toBe(stableWindowId);
  });

  it("reuses the stable window while it has no cache yet", () => {
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: [stableWindowId],
        incomingMessages,
        getCachedMessages: () => undefined,
      }),
    ).toBe(stableWindowId);
  });

  it("mints a window of its own once the stable window has been edited", () => {
    const targetWindowId = resolveJumpTargetWindowId({
      stableWindowId,
      incomingMessages,
      ...caches({ [stableWindowId]: [message("You are a pirate")] }),
    });

    expect(targetWindowId).toMatch(
      new RegExp(
        `^${stableWindowId}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ),
    );
  });

  it("reuses a window an earlier jump opened for the same messages", () => {
    const siblingId = `${stableWindowId}-11111111-2222-3333-4444-555555555555`;

    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingMessages,
        ...caches({
          [stableWindowId]: [message("You are a pirate")],
          [siblingId]: [message("You are a helpful assistant", "other-id")],
        }),
      }),
    ).toBe(siblingId);
  });

  it("mints another window when every sibling holds something else", () => {
    const siblingId = `${stableWindowId}-11111111-2222-3333-4444-555555555555`;

    const targetWindowId = resolveJumpTargetWindowId({
      stableWindowId,
      incomingMessages,
      ...caches({
        [stableWindowId]: [message("You are a pirate")],
        [siblingId]: [message("And rhyme")],
      }),
    });

    expect(targetWindowId).not.toBe(stableWindowId);
    expect(targetWindowId).not.toBe(siblingId);
  });

  it("does not claim the stable window of a source whose id extends this one", () => {
    const otherSourceId = `${stableWindowId}-def`;

    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingMessages,
        ...caches({
          [stableWindowId]: [message("You are a pirate")],
          [otherSourceId]: [message("You are a helpful assistant", "other-id")],
        }),
      }),
    ).not.toBe(otherSourceId);
  });
});
