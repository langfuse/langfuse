import { v4 as uuidv4 } from "uuid";

/**
 * `crypto.randomUUID` polyfill for non-secure contexts.
 *
 * `crypto.randomUUID` is a secure-context-only Web API: it exists on HTTPS and
 * localhost, but is undefined when a self-hosted instance is opened over plain
 * HTTP (e.g. `http://<lan-ip>:3000`). Any unguarded call — from our code or a
 * bundled dependency — then throws `TypeError: crypto.randomUUID is not a
 * function` and white-screens the app (LFE-10858).
 *
 * Installing a fallback at the client entry point (first import in _app.tsx)
 * protects every caller, including dependencies we don't control. uuid's
 * `v4()` only needs `crypto.getRandomValues`, which is available in
 * non-secure contexts too.
 *
 * For direct calls in our own code, prefer `safeRandomUUID()` from
 * `@/src/utils/safe-random-uuid` over `crypto.randomUUID()` — it does not
 * depend on this polyfill having run.
 */
export function installCryptoRandomUUIDPolyfill(
  // Structural type so the uuid-backed fallback (plain `string`) is
  // assignable — `Crypto["randomUUID"]` returns a template-literal type.
  target: { randomUUID?: () => string } | undefined = globalThis.crypto,
): void {
  if (!target || typeof target.randomUUID === "function") return;
  // Pass an options object so uuid's v4() takes its crypto.getRandomValues
  // path unconditionally. A bare v4() consults crypto.randomUUID at call
  // time — which is this polyfill once installed, so it would recurse.
  target.randomUUID = () => uuidv4({});
}

installCryptoRandomUUIDPolyfill();
