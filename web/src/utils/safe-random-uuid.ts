import { v4 as uuidv4 } from "uuid";

/**
 * UUID v4 generator that also works on non-secure (plain-HTTP) origins.
 *
 * `crypto.randomUUID()` is a secure-context-only Web API — it is undefined
 * when a self-hosted instance is accessed over plain HTTP via a LAN IP or
 * hostname, and calling it there crashes the app (LFE-10858). uuid's `v4()`
 * uses the native `crypto.randomUUID` when present and falls back to
 * `crypto.getRandomValues`, which works in any context.
 *
 * Use this instead of `crypto.randomUUID()` in client-side code. (A safety-net
 * polyfill also installs `crypto.randomUUID` at the app entry point — see
 * `@/src/polyfills/crypto-random-uuid` — but direct calls should not rely on
 * import order.)
 */
export function safeRandomUUID(): string {
  return uuidv4();
}
