import { type ChatMessage, type PlaceholderMessage } from "@langfuse/shared";

import { getMessagesFingerprint } from "./messagesFingerprint";

type ShouldOpenAdditionalWindowArgs = {
  /** Whether the target window is currently open in the playground. */
  isTargetWindowOpen: boolean;
  /** Messages the target window currently holds, if it has a cache. */
  cachedMessages: (ChatMessage | PlaceholderMessage)[] | undefined;
  /** Messages about to be written by the jump. */
  incomingMessages: (ChatMessage | PlaceholderMessage)[];
};

export const shouldOpenAdditionalWindow = ({
  isTargetWindowOpen,
  cachedMessages,
  incomingMessages,
}: ShouldOpenAdditionalWindowArgs): boolean => {
  if (!isTargetWindowOpen) return false;

  // Open but empty, so nothing to lose either.
  if (!cachedMessages) return false;

  return (
    getMessagesFingerprint(cachedMessages) !==
    getMessagesFingerprint(incomingMessages)
  );
};
