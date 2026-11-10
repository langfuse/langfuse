import { type RefObject, useEffect, useRef } from "react";

export function useSessionObservationNavigation({
  feedRef,
  selectTrace,
  onObservationNotFound,
  getObservationState,
}: {
  feedRef: RefObject<HTMLDivElement | null>;
  selectTrace: (index: number) => void;
  onObservationNotFound?: (index: number, observationId: string) => void;
  getObservationState?: (
    index: number,
    observationId: string,
  ) => "loading" | "visible" | "missing";
}) {
  const observationScrollCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => observationScrollCleanupRef.current?.(), []);

  return (index: number, observationId: string | undefined) => {
    observationScrollCleanupRef.current?.();
    observationScrollCleanupRef.current = null;
    selectTrace(index);
    if (!observationId) return;

    const feed = feedRef.current;
    if (!feed) return;

    const scrollToObservation = () => {
      if (getObservationState?.(index, observationId) === "missing") {
        onObservationNotFound?.(index, observationId);
        return true;
      }
      const observation = Array.from(
        feed.querySelectorAll<HTMLElement>("[data-session-observation-id]"),
      ).find(
        (element) => element.dataset.sessionObservationId === observationId,
      );
      if (!observation) return false;

      const top =
        feed.scrollTop +
        observation.getBoundingClientRect().top -
        feed.getBoundingClientRect().top -
        Math.max(0, (feed.clientHeight - observation.clientHeight) / 2);
      feed.scrollTo({ top, behavior: "smooth" });
      return true;
    };

    if (scrollToObservation()) return;

    let timeout: number;
    const observer = new MutationObserver(() => {
      if (!scrollToObservation()) return;
      observationScrollCleanupRef.current?.();
      observationScrollCleanupRef.current = null;
    });
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
    observer.observe(feed, { childList: true, subtree: true });
    timeout = window.setTimeout(() => {
      cleanup();
      if (observationScrollCleanupRef.current === cleanup) {
        observationScrollCleanupRef.current = null;
        onObservationNotFound?.(index, observationId);
      }
    }, 5_000);
    observationScrollCleanupRef.current = cleanup;
  };
}
