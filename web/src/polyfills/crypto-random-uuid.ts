import { v4 as uuidv4 } from "uuid";

/**
 * Crypto fallbacks installed at the client entry point (first import in
 * `_app.tsx`) so every caller — including dependencies we don't control —
 * survives two browser gaps:
 *
 * 1. `crypto.randomUUID` is secure-context-only. On plain HTTP (e.g.
 *    `http://<lan-ip>:3000`) it is undefined; an unguarded call white-screens
 *    the app. uuid's `v4()` only needs `crypto.getRandomValues`.
 * 2. Firefox can throw `OperationError: The operation failed for an
 *    operation-specific reason` from `crypto.getRandomValues` itself (broken
 *    NSS, resist-fingerprinting, transient entropy). PostHog's uuidv7
 *    device-id path calls it during `posthog.init` at app boot.
 *
 * For direct calls in our own code, prefer `safeRandomUUID()` from
 * `@/src/utils/safe-random-uuid` over `crypto.randomUUID()` — it does not
 * depend on this module having run.
 */

/**
 * Firefox's generic wording when Web Crypto fails for an engine-internal
 * reason. Whole-message + `OperationError` name only — `QuotaExceededError`
 * (typed array larger than 65,536 bytes) and other DOMExceptions keep
 * throwing.
 */
const FIREFOX_GETRANDOMVALUES_OPERATION_ERROR =
  "The operation failed for an operation-specific reason";

export function isFirefoxGetRandomValuesOperationError(
  error: unknown,
): boolean {
  if (!(error instanceof DOMException) || error.name !== "OperationError") {
    return false;
  }
  return (
    error.message.replace(/\.$/, "").trim() ===
    FIREFOX_GETRANDOMVALUES_OPERATION_ERROR
  );
}

function fillArrayBufferViewWithMathRandom(array: ArrayBufferView): void {
  const bytes = new Uint8Array(
    array.buffer,
    array.byteOffset,
    array.byteLength,
  );
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

export function installGetRandomValuesOperationErrorFallback(
  target:
    | { getRandomValues?: (array: ArrayBufferView) => ArrayBufferView }
    | undefined = globalThis.crypto,
): void {
  if (!target || typeof target.getRandomValues !== "function") return;

  const original = target.getRandomValues.bind(target);
  target.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    try {
      return original(array) as T;
    } catch (error) {
      if (!isFirefoxGetRandomValuesOperationError(error)) {
        throw error;
      }
      // CSPRNG is unavailable in this Firefox context. Weak fill keeps UUID
      // / analytics device-id generation alive; do not use this path for
      // secrets — there is no platform entropy to use instead.
      fillArrayBufferViewWithMathRandom(array);
      return array;
    }
  };
}

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
installGetRandomValuesOperationErrorFallback();
