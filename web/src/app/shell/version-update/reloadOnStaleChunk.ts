/**
 * One-shot hard reload when a Next.js static chunk script fails to load on a
 * tab that has already observed a newer build.
 *
 * Long-lived tabs keep a superseded bundle after a deploy; the next
 * code-split navigation 404s a content-hashed `/_next/static/` script and
 * Next.js then `console.error`s `Error rendering page:`. The version-update
 * banner is the prompt for a still-working tab; this listener recovers a tab
 * that already crashed. Reload is gated on
 * {@link versionUpdateStore.hasObservedVersionMismatch} so a transient CDN
 * blip or lazy-chunk hiccup on a current-build tab is not force-reloaded.
 * Never loops: sessionStorage records the attempt, and a storage failure
 * skips the reload rather than retrying.
 */

import { versionUpdateStore } from "./versionUpdateStore";

export const STALE_CHUNK_RELOAD_SESSION_KEY = "langfuse:stale-chunk-reloaded";

const NEXT_STATIC_PATH = "/_next/static/";

let installed = false;

export function isStaleNextScriptElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLScriptElement && target.src.includes(NEXT_STATIC_PATH)
  );
}

export function handleStaleChunkScriptError(
  event: Event,
  hasObservedVersionMismatch: () => boolean = () =>
    versionUpdateStore.hasObservedVersionMismatch(),
): void {
  if (!isStaleNextScriptElement(event.target)) return;
  if (!hasObservedVersionMismatch()) return;
  try {
    if (sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)) return;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_SESSION_KEY, "1");
  } catch {
    return;
  }
  window.location.reload();
}

export function installStaleChunkReloadListener(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", handleStaleChunkScriptError, true);
}
