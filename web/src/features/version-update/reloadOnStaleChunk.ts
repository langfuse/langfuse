/**
 * One-shot hard reload when a Next.js static chunk script fails to load on a
 * tab that has already observed a newer build, or when Turbopack throws
 * "module factory is not available" (the runtime graph is already unusable).
 *
 * Long-lived tabs keep a superseded bundle after a deploy; the next
 * code-split navigation 404s a content-hashed `/_next/static/` script and
 * Next.js then `console.error`s `Error rendering page:`. The version-update
 * banner is the prompt for a still-working tab; this listener recovers a tab
 * that already crashed. Script-tag reload is gated on
 * {@link versionUpdateStore.hasObservedVersionMismatch} so a transient CDN
 * blip or lazy-chunk hiccup on a current-build tab is not force-reloaded.
 * The Turbopack factory miss skips that gate: the throw itself means the
 * page cannot hydrate, and it often fires on first navigation (e.g. sign-in)
 * before the version poll has run. Never loops: sessionStorage records the
 * attempt, and a storage failure skips the reload rather than retrying.
 */

import { isTurbopackModuleFactoryUnavailableMessage } from "@/src/utils/sentryFilters";
import { versionUpdateStore } from "./versionUpdateStore";

export const STALE_CHUNK_RELOAD_SESSION_KEY = "langfuse:stale-chunk-reloaded";

const NEXT_STATIC_PATH = "/_next/static/";

let installed = false;

export function isStaleNextScriptElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLScriptElement && target.src.includes(NEXT_STATIC_PATH)
  );
}

function tryOneShotReload(): void {
  try {
    if (sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)) return;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_SESSION_KEY, "1");
  } catch {
    return;
  }
  window.location.reload();
}

export function handleStaleChunkScriptError(
  event: Event,
  hasObservedVersionMismatch: () => boolean = () =>
    versionUpdateStore.hasObservedVersionMismatch(),
): void {
  if (!isStaleNextScriptElement(event.target)) return;
  if (!hasObservedVersionMismatch()) return;
  tryOneShotReload();
}

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "";
}

export function handleTurbopackModuleFactoryUnavailable(reason: unknown): void {
  if (!isTurbopackModuleFactoryUnavailableMessage(reasonMessage(reason))) {
    return;
  }
  tryOneShotReload();
}

function handleWindowErrorForStaleBundle(event: Event): void {
  handleStaleChunkScriptError(event);
  if (event instanceof ErrorEvent) {
    handleTurbopackModuleFactoryUnavailable(event.error ?? event.message);
  }
}

function handleUnhandledRejectionForStaleBundle(
  event: PromiseRejectionEvent,
): void {
  handleTurbopackModuleFactoryUnavailable(event.reason);
}

export function installStaleChunkReloadListener(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", handleWindowErrorForStaleBundle, true);
  window.addEventListener(
    "unhandledrejection",
    handleUnhandledRejectionForStaleBundle,
  );
}
