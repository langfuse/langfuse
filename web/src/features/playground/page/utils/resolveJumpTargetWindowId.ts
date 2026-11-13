import { v4 as uuidv4 } from "uuid";

import { getMessagesFingerprint } from "./messagesFingerprint";
import type { PlaygroundCache } from "../types";

type WindowDraft = Pick<
  NonNullable<PlaygroundCache>,
  "messages" | "promptVariables"
>;

type ResolveJumpTargetWindowIdArgs = {
  stableWindowId: string;
  openWindowIds: string[];
  incomingState: WindowDraft;
  getCachedState: (windowId: string) => WindowDraft | null | undefined;
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

const getVariableValuesFingerprint = (
  variables: WindowDraft["promptVariables"],
): string =>
  JSON.stringify(
    (variables ?? [])
      .map(({ name, value }): [string, string] => [name, value])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

export const resolveJumpTargetWindowId = ({
  stableWindowId,
  openWindowIds,
  incomingState,
  getCachedState,
}: ResolveJumpTargetWindowIdArgs): string => {
  if (!openWindowIds.includes(stableWindowId)) return stableWindowId;

  const incomingFingerprint = getMessagesFingerprint(incomingState.messages);
  const incomingVariables = getVariableValuesFingerprint(
    incomingState.promptVariables,
  );
  const holdsIncomingState = (windowId: string): boolean => {
    const cachedState = getCachedState(windowId);
    // Open but empty, so nothing to lose either.
    if (!cachedState) return true;

    return (
      getMessagesFingerprint(cachedState.messages) === incomingFingerprint &&
      getVariableValuesFingerprint(cachedState.promptVariables) ===
        incomingVariables
    );
  };

  if (holdsIncomingState(stableWindowId)) return stableWindowId;

  const reusableSiblingId = openWindowIds.find(
    (windowId) =>
      isSiblingOf(stableWindowId, windowId) && holdsIncomingState(windowId),
  );

  return reusableSiblingId ?? `${stableWindowId}-${uuidv4()}`;
};
