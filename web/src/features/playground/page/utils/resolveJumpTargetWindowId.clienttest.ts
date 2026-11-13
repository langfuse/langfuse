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
  getCachedState: (windowId: string) => {
    const messages = entries[windowId];
    return messages ? { messages } : undefined;
  },
});

describe("resolveJumpTargetWindowId", () => {
  it("addresses the stable window whenever nothing would be lost", () => {
    // Not open at all.
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: ["some-other-window"],
        incomingState: { messages: incomingMessages },
        getCachedState: () => ({ messages: editedPrompt }),
      }),
    ).toBe(stableWindowId);

    // Open and still holding the stored prompt. Message ids are assigned on
    // hydration, so they must not count towards the comparison.
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingState: { messages: incomingMessages },
        ...caches({ [stableWindowId]: storedPrompt }),
      }),
    ).toBe(stableWindowId);

    // Open with nothing cached yet.
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: [stableWindowId],
        incomingState: { messages: incomingMessages },
        getCachedState: () => undefined,
      }),
    ).toBe(stableWindowId);
  });

  it("mints a sibling once the stable window is edited, then jumps back into it", () => {
    const edited = { [stableWindowId]: editedPrompt };

    const siblingId = resolveJumpTargetWindowId({
      stableWindowId,
      incomingState: { messages: incomingMessages },
      ...caches(edited),
    });

    expect(siblingId).toMatch(new RegExp(`^${stableWindowId}-${UUID}$`));

    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        incomingState: { messages: incomingMessages },
        ...caches({
          ...edited,
          [`${stableWindowId}-def`]: storedPrompt,
          [siblingId]: storedPrompt,
        }),
      }),
    ).toBe(siblingId);
  });

  it("preserves edited variable values and reuses an equivalent sibling", () => {
    const promptVariables = [{ name: "topic", value: "logging", isUsed: true }];
    const editedState = {
      messages: storedPrompt,
      promptVariables: [{ name: "topic", value: "edited draft", isUsed: true }],
    };
    const incomingState = { messages: incomingMessages, promptVariables };
    const siblingId = resolveJumpTargetWindowId({
      stableWindowId,
      openWindowIds: [stableWindowId],
      incomingState,
      getCachedState: () => editedState,
    });

    expect(siblingId).toMatch(new RegExp(`^${stableWindowId}-${UUID}$`));
    expect(
      resolveJumpTargetWindowId({
        stableWindowId,
        openWindowIds: [stableWindowId, siblingId],
        incomingState,
        getCachedState: (windowId) =>
          windowId === stableWindowId
            ? editedState
            : {
                messages: storedPrompt,
                promptVariables: promptVariables.map(({ name, value }) => ({
                  name,
                  value,
                  isUsed: false,
                })),
              },
      }),
    ).toBe(siblingId);
  });
});
