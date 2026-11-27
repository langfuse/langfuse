import { useEffect, useState, type RefObject } from "react";

/** Seconds into a loop, advanced every animation frame while `target` is on screen; stays at `startAt` on the server and under reduced motion. */
export function useLoopTime(
  loop: number,
  startAt: number,
  target: RefObject<Element | null>,
) {
  const [seconds, setSeconds] = useState(startAt);
  useEffect(() => {
    const node = target.current;
    // Without `matchMedia` or `IntersectionObserver` (jsdom) nothing moves.
    if (!node || !window.matchMedia || !window.IntersectionObserver) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const origin = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setSeconds((startAt + Math.max(0, now - origin) / 1000) % loop);
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => {
      cancelAnimationFrame(frame);
      if (entries.at(-1)?.isIntersecting) frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [loop, startAt, target]);
  return seconds;
}
