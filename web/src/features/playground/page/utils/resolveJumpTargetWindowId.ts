import { v4 as uuidv4 } from "uuid";

import { type ChatMessage, type PlaceholderMessage } from "@langfuse/shared";

import { getMessagesFingerprint } from "./messagesFingerprint";

type ResolveJumpTargetWindowIdArgs = {
  /** The id a jump from this source addresses by default. */
  stableWindowId: string;
  /** Windows currently open in the playground. */
  openWindowIds: string[];
  /** Messages the jump is about to write. */
  incomingMessages: (ChatMessage | PlaceholderMessage)[];
  /** What a window currently holds, or undefined while it has no cache. */
  getCachedMessages: (
    windowId: string,
  ) => (ChatMessage | PlaceholderMessage)[] | undefined;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A window opened by an earlier jump from the same source. Matching on the
 * prefix alone would also claim the stable window of a source whose own id
 * starts with this one, so the suffix has to be a uuid as minted below.
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
