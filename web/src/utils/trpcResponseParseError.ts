import { TRPCClientError } from "@trpc/client";

/**
 * Thrown by the tRPC fetch wrapper when an HTTP body is not a JSON tRPC
 * envelope: an explicit non-JSON content type (a gateway HTML page), or a
 * `Response.json()` rejection.
 *
 * Chrome and Firefox reject `Response.json()` with a real `SyntaxError`.
 * Safari rejects with a DOMException whose `name` is `"SyntaxError"` and
 * whose message is "The string did not match the expected pattern." — that
 * object is not `instanceof SyntaxError`, so engine checks on the constructor
 * miss it. Callers classify this type instead of the engine error.
 *
 * `responseStatus` is the HTTP status. The procedure path stays on the
 * existing toast WeakMap (`rememberTrpcToastOperation`); a non-JSON body
 * has no envelope to carry it.
 */
export class TrpcNonJsonResponseError extends Error {
  readonly responseStatus: number;

  constructor(responseStatus: number, cause?: unknown) {
    super(
      "tRPC response was not JSON",
      cause instanceof Error ? { cause } : undefined,
    );
    this.name = "TrpcNonJsonResponseError";
    this.responseStatus = responseStatus;
  }
}

const JSON_MEDIA_TYPES = new Set(["application/json", "text/json"]);

/**
 * True when the body should be handed to `Response.json()`.
 * A missing Content-Type is parsed, so a JSON response that omitted the
 * header still decodes. An explicit non-JSON type (`text/html`, `text/plain`)
 * is not — those are gateway/error pages, and parsing them throws an
 * engine-specific SyntaxError with no status attached.
 */
export function shouldParseResponseAsJson(contentType: string | null): boolean {
  if (contentType === null) return true;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType.length === 0) return true;
  return JSON_MEDIA_TYPES.has(mediaType) || mediaType.endsWith("+json");
}

/** Chrome/Firefox `SyntaxError`, or Safari's DOMException named `SyntaxError`. */
export function isResponseJsonParseFailure(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  // Safari: DOMException named SyntaxError, not a JS SyntaxError.
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "SyntaxError"
  );
}

/**
 * Firefox throws this TypeError when fetch headers arrived but the body was
 * shorter than Content-Length (truncated connection, proxy, gzip). Chrome
 * surfaces the same truncated body as a JSON SyntaxError; Safari as a
 * DOMException named SyntaxError. The TypeError is not `instanceof
 * SyntaxError`, so {@link isResponseJsonParseFailure} misses it.
 *
 * Stored without a trailing period because Firefox sometimes appends one.
 */
const FIREFOX_TRUNCATED_BODY_MESSAGE =
  "Content-Length header of network response exceeds response Body";

function isFirefoxTruncatedBodyMessage(value: string): boolean {
  return (
    value.trim().replace(/\.$/, "").trim() === FIREFOX_TRUNCATED_BODY_MESSAGE
  );
}

/** True for Firefox's truncated-body fetch TypeError. */
function isFirefoxTruncatedBodyTypeError(error: unknown): boolean {
  return (
    error instanceof TypeError && isFirefoxTruncatedBodyMessage(error.message)
  );
}

type AnnotatedSyntaxError = SyntaxError & { responseStatus?: number };

/** HTTP status previously attached to a JSON parse error, if any. */
export function readAnnotatedResponseStatus(
  cause: unknown,
): number | undefined {
  if (cause instanceof TrpcNonJsonResponseError) return cause.responseStatus;
  if (
    cause instanceof SyntaxError &&
    typeof (cause as AnnotatedSyntaxError).responseStatus === "number"
  ) {
    return (cause as AnnotatedSyntaxError).responseStatus;
  }
  return undefined;
}

/**
 * A tRPC client error whose body never became an envelope. The `cause`
 * intersection keeps this a subtype of `TRPCClientError`, so a failed check
 * does not erase the remaining client-error type.
 */
type TrpcNonJsonBodyError = TRPCClientError<any> & {
  cause: TrpcNonJsonResponseError | SyntaxError | DOMException | TypeError;
};

/**
 * True when `error` is a TRPCClientError whose body never became a tRPC
 * envelope. A populated `error.data` means the server answered with JSON.
 */
export function isTrpcNonJsonBodyError(
  error: unknown,
): error is TrpcNonJsonBodyError {
  if (!(error instanceof TRPCClientError)) return false;
  if (error.data) return false;
  const cause = error.cause;
  return (
    cause instanceof TrpcNonJsonResponseError ||
    isResponseJsonParseFailure(cause) ||
    isFirefoxTruncatedBodyTypeError(cause)
  );
}
