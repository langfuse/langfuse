import { useEffect, useState } from "react";

/** Seconds into a loop, advanced every animation frame from `startAt`; stays at `startAt` on the server and under reduced motion. */
export function useLoopTime(loop: number, startAt: number) {
  const [seconds, setSeconds] = useState(startAt);
  useEffect(() => {
    // Without `matchMedia` (jsdom) the motion preference is unknown, so nothing moves.
    if (!window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const origin = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setSeconds((startAt + Math.max(0, now - origin) / 1000) % loop);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [loop, startAt]);
  return seconds;
}
