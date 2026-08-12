import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough to read one sentence, short enough to not sit on the composer. */
const HINT_VISIBLE_MS = 5_000;

/**
 * Teaching moment for background runs, shown when a conversation's first
 * message starts a run: the run survives minimizing, and the activity
 * notifications bring the user back when it finishes or needs them.
 *
 * Tied to the conversation rather than remembered per user — starting a new
 * conversation is exactly the moment the promise is worth repeating, and it
 * keeps the nudge out of the middle of an ongoing exchange.
 */
export function useInAppAgentBackgroundHint() {
  const [isVisible, setIsVisible] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setIsVisible(false);
  }, []);

  useEffect(() => hide, [hide]);

  const show = useCallback(() => {
    setIsVisible(true);

    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
    }

    hideTimeoutRef.current = window.setTimeout(() => {
      hideTimeoutRef.current = null;
      setIsVisible(false);
    }, HINT_VISIBLE_MS);
  }, []);

  return { isVisible, show, hide };
}
