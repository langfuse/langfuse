import { describe, expect, it } from "vitest";

import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "@langfuse/shared";

import { shouldOpenAdditionalWindow } from "./shouldOpenAdditionalWindow";

const message = (content: string, id = "generated-on-hydration"): ChatMessage =>
  ({
    id,
    type: ChatMessageType.System,
    role: ChatMessageRole.System,
    content,
  }) as ChatMessage;

describe("shouldOpenAdditionalWindow", () => {
  const incomingMessages = [message("You are a helpful assistant")];

  it("reuses the window while it still holds the stored prompt", () => {
    expect(
      shouldOpenAdditionalWindow({
        isTargetWindowOpen: true,
        cachedMessages: [message("You are a helpful assistant", "other-id")],
        incomingMessages,
      }),
    ).toBe(false);
  });

  it("opens another window once the open window has been edited", () => {
    expect(
      shouldOpenAdditionalWindow({
        isTargetWindowOpen: true,
        cachedMessages: [message("You are a pirate")],
        incomingMessages,
      }),
    ).toBe(true);
  });

  it("opens another window when messages were added to the open window", () => {
    expect(
      shouldOpenAdditionalWindow({
        isTargetWindowOpen: true,
        cachedMessages: [...incomingMessages, message("And rhyme")],
        incomingMessages,
      }),
    ).toBe(true);
  });

  it("reuses the id when the cache is an orphan of a window that is not open", () => {
    expect(
      shouldOpenAdditionalWindow({
        isTargetWindowOpen: false,
        cachedMessages: [message("You are a pirate")],
        incomingMessages,
      }),
    ).toBe(false);
  });

  it("reuses the window when it has no cache yet", () => {
    expect(
      shouldOpenAdditionalWindow({
        isTargetWindowOpen: true,
        cachedMessages: undefined,
        incomingMessages,
      }),
    ).toBe(false);
  });
});
