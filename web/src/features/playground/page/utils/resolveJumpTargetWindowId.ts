import { v4 as uuidv4 } from "uuid";

import { type ChatMessage, type PlaceholderMessage } from "@langfuse/shared";

import { getMessagesFingerprint } from "./messagesFingerprint";

type ResolveJumpTargetWindowIdArgs = {
  stableWindowId: string;
  openWindowIds: string[];
  incomingMessages: (ChatMessage | PlaceholderMessage)[];
  getCachedMessages: (
    windowId: string,
  ) => (ChatMessage | PlaceholderMessage)[] | undefined;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * we track if a window exists for current prompt by having a stable window id + random string
 * we use UUID as random string because it's easy to validate against
 */
const isSiblingOf = (stableWindowId: string, windowId: string): boolean =>
  windowId.startsWith(`${stableWindowId}-`) &&
  UUID_PATTERN.test(windowId.slice(stableWindowId.length + 1));

export const resolveJumpTargetWindowId = ({
  stableWindowId,
  openWindowIds,
  incomingMessages,
  getCachedMessages,
}: ResolveJumpTargetWindowIdArgs): string => {
  if (!openWindowIds.includes(stableWindowId)) return stableWindowId;

  const incomingFingerprint = getMessagesFingerprint(incomingMessages);
  const holdsIncomingMessages = (windowId: string): boolean => {
    const cachedMessages = getCachedMessages(windowId);
    // Open but empty, so nothing to lose either.
    if (!cachedMessages) return true;

    return getMessagesFingerprint(cachedMessages) === incomingFingerprint;
  };

  if (holdsIncomingMessages(stableWindowId)) return stableWindowId;

  const reusableSiblingId = openWindowIds.find(
    (windowId) =>
      isSiblingOf(stableWindowId, windowId) && holdsIncomingMessages(windowId),
  );

  return reusableSiblingId ?? `${stableWindowId}-${uuidv4()}`;
};
