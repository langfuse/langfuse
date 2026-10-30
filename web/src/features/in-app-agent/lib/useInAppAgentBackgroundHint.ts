import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough to read one sentence, short enough to not sit on the composer. */
const HINT_VISIBLE_MS = 5_000;

/**
 * Visibility for the background-run hint. It lives as long as the wait it
 * describes: the timeout above, or the run settling first.
 */
export function useInAppAgentBackgroundHint({
  isRunActive,
}: {
  isRunActive: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [wasRunActive, setWasRunActive] = useState(isRunActive);
  const hideTimeoutRef = useRef<number | null>(null);

  // Settling ends the wait the hint describes. A leftover timeout is harmless:
  // hiding twice is a no-op, and `show` re-arms it.
  if (wasRunActive !== isRunActive) {
    setWasRunActive(isRunActive);

    if (wasRunActive) {
      setIsVisible(false);
    }
  }

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
