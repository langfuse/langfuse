// Keep this module free of env imports: env.ts uses parseOutboundUrl to
// validate operator-configured endpoints at startup.

export type OutboundUrlValidationErrorCode =
  | "blocked-hostname"
  | "blocked-ip"
  | "dns-lookup-failed"
  | "host-not-allowed"
  | "https-required"
  | "invalid-encoding"
  | "invalid-syntax"
  | "port-not-allowed"
  | "protocol-not-allowed"
  | "url-credentials-not-allowed";

export class OutboundUrlValidationError extends Error {
  constructor(
    readonly code: OutboundUrlValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutboundUrlValidationError";
  }
}

export function parseOutboundUrl(urlString: string): URL {
  const trimmedUrl = urlString.trim();
  assertValidUrlEncoding(trimmedUrl);

  let url: URL;
  try {
    // Parse the original URL string so validation uses the same WHATWG URL
    // semantics as fetch. Decoding the whole URL first can turn encoded data
    // into delimiters and make validation inspect a different hostname.
    url = new URL(trimmedUrl);
  } catch {
    throw new OutboundUrlValidationError(
      "invalid-syntax",
      "Invalid URL syntax",
    );
  }

  if (url.username !== "" || url.password !== "") {
    throw new OutboundUrlValidationError(
      "url-credentials-not-allowed",
      "URL credentials are not allowed. Use authentication headers instead.",
    );
  }

  return url;
}

function assertValidUrlEncoding(urlString: string): void {
  // This intentionally checks encoding validity only. Do not parse or validate
  // the decoded result: decoding the whole URL can turn encoded data into URL
  // delimiters and make validation inspect a different hostname than fetch.
  try {
    decodeURIComponent(urlString);
  } catch {
    throw new OutboundUrlValidationError(
      "invalid-encoding",
      "Invalid URL encoding",
    );
  }
}
