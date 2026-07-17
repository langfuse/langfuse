import { captureException } from "@sentry/nextjs";

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
 * Report an unknown (possibly non-Error) value to Sentry as a legible Error.
 *
 * `instrumentation-client.ts` enables
 * `captureConsoleIntegration({ levels: ["error"] })`, so every
 * `console.error(nonError)` also becomes an opaque Sentry event
 * (`[object Object]` / "Object captured as exception with keys …"). Route
 * caught-unknown values through here instead: real `Error`s pass through
 * untouched (stack preserved); anything else is synthesized into an `Error`
 * with a readable message. We log with `console.warn` (not `console.error`) so
 * the integration does not double-capture the same failure.
 */
export function captureUnknownError(
  context: string,
  value: unknown,
  extra?: Record<string, unknown>,
): void {
  const err =
    value instanceof Error
      ? value
      : new Error(
          `[${context}] ${
            typeof value === "string" ? value : safeStringify(value)
          }`,
        );
  captureException(err, {
    extra: { context, ...extra },
    tags: { area: context },
  });
  // warn, not error → captureConsoleIntegration only captures console.error,
  // so this line does not create a second, opaque Sentry event. The
  // synthesized (non-Error) message already carries the `[context]` prefix; a
  // pass-through Error does not, so add it here only in that branch to keep the
  // context present exactly once in both cases.
  console.warn(
    value instanceof Error ? `[${context}] ${err.message}` : err.message,
  );
}
