import { addBreadcrumb, captureException } from "@sentry/nextjs";

/**
 * Turn an unknown thrown/logged value into a legible string.
 *
 * `String(value)` and template interpolation collapse most objects to the
 * useless `[object Object]` / `[object ErrorEvent]`. We try `JSON.stringify`
 * first, and when that yields nothing useful — `"{}"` for objects whose fields
 * live on the prototype (DOM `Event`s, `DOMException`), or a throw on circular
 * references — we fall back to a descriptor built from the value's constructor
 * name and own enumerable keys.
 */
function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined && json !== "{}") {
      return json;
    }
  } catch {
    // circular reference or a throwing getter — fall through to describe()
  }
  return describeUnknown(value);
}

function describeUnknown(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return String(value);
  const ctorName =
    (value as { constructor?: { name?: string } }).constructor?.name ??
    "Object";
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 ? `${ctorName} { ${keys.join(", ")} }` : ctorName;
}

/**
 * Coerce any caught/unknown value into a legible real `Error`.
 *
 * This is the single unknown→`Error` coercion in the client codebase; both the
 * generic {@link reportError} seam and the legacy `captureUnknownError` helper
 * route through it. Real `Error`s pass through untouched so Sentry keeps the
 * original stack; anything else is synthesized into an `Error` whose message is
 * `[area] <readable value>` (never `[object Object]`), so the synthesized event
 * both groups by `area` and stays diagnosable.
 */
export function coerceToError(area: string, value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error(
        `[${area}] ${typeof value === "string" ? value : safeStringify(value)}`,
      );
}

/**
 * The single capture seam every future client error-report routes through.
 *
 * Why a seam: classification and tagging live in one place, so Sentry's
 * `beforeSend` in `instrumentation-client.ts` can be a backstop rather than the
 * strategy. Report through here instead of calling `captureException` directly.
 *
 * Behavior:
 * - `expected: true` — the failure is the product working as designed (a state
 *   the UI already renders: a missing/forbidden resource, invalid user input, an
 *   offline/transport blip the server already owns). We do NOT capture — an event
 *   in Sentry is a promise a human should act, and nobody acts on an expected
 *   state. We drop a breadcrumb so the (unexpected) error that DOES get captured
 *   later in the session still carries the trail of what happened before it.
 * - otherwise — coerce to a real `Error` (see {@link coerceToError}),
 *   `captureException` with an `area` tag (so issues route/group by surface) and
 *   the caller's structured `extra`, then log a companion `console.warn`.
 *
 * `console.warn`, never `console.error`: `instrumentation-client.ts` enables
 * `captureConsoleIntegration({ levels: ["error"] })`, so a `console.error` here
 * would mint a second, opaque Sentry event for the same failure.
 *
 * PII: keep the message static and legible and never route user content
 * (prompt/trace text, tokens, ids, share-link secrets) through it — a message
 * that interpolates user data both leaks and shatters Sentry grouping. Keeping
 * `extra` free of PII is the caller's responsibility; this seam does not scrub it.
 */
export function reportError(
  error: unknown,
  opts: { area: string; expected?: boolean; extra?: Record<string, unknown> },
): void {
  if (opts.expected === true) {
    addBreadcrumb({
      category: opts.area,
      type: "error",
      level: "info",
      message: "Expected error (not captured)",
      data: { ...opts.extra },
    });
    return;
  }

  const err = coerceToError(opts.area, error);
  captureException(err, {
    tags: { area: opts.area },
    extra: opts.extra,
  });
  // warn, not error → captureConsoleIntegration only captures console.error, so
  // this line does not create a second, opaque event. Show the `area` exactly
  // once: a synthesized error already embeds `[area]` in its message
  // (coerceToError), a pass-through real Error does not — so prefix only that
  // branch to keep the surface legible in the console without duplicating it.
  console.warn(
    error instanceof Error ? `[${opts.area}] ${err.message}` : err.message,
  );
}
