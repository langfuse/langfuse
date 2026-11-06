import { InvalidRequestError } from "@langfuse/shared";

// The gateway rejects connections whose headers would replace the credential or
// break HTTP framing, so they must never be saved.
const RESERVED_HEADER_NAMES = new Set([
  "accept-encoding",
  "authorization",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "te", // codespell:ignore
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-api-key",
]);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HEADER_VALUE = /^[\t\x20-\x7e]*$/;

export function assertValidExtraHeaders(headers: Record<string, string>) {
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (!HEADER_NAME.test(name)) {
      throw new InvalidRequestError(`Invalid header name: ${name}`);
    }
    if (
      RESERVED_HEADER_NAMES.has(lowerName) ||
      lowerName.startsWith("proxy-")
    ) {
      throw new InvalidRequestError(`The ${name} header cannot be overridden`);
    }
    if (!HEADER_VALUE.test(value)) {
      throw new InvalidRequestError(
        `The ${name} header value must be printable ASCII`,
      );
    }
  }
}
