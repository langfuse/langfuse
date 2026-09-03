/** basicPrefix is the HTTP Basic auth scheme prefix. */
const basicPrefix = "Basic ";

/** bearerPrefix is the HTTP Bearer auth scheme prefix. */
const bearerPrefix = "Bearer ";

/** Credential is the parsed Authorization wire format — a scheme, never a verification outcome. */
export type Credential =
  | { kind: "basic"; publicKey: string; secretKey: string }
  | { kind: "bearer"; token: string }
  | { kind: "malformed" };

/** parseAuthorizationHeader decodes the Authorization header into its scheme, or `malformed` for anything unparsable. */
export function parseAuthorizationHeader(
  header: string | undefined,
): Credential {
  if (header?.startsWith(basicPrefix)) {
    const decoded = decodeBasic(header.slice(basicPrefix.length));
    if (!decoded) return { kind: "malformed" };
    return { kind: "basic", ...decoded };
  }
  if (header?.startsWith(bearerPrefix)) {
    return { kind: "bearer", token: header.slice(bearerPrefix.length) };
  }
  return { kind: "malformed" };
}

/** decodeBasic decodes a base64 `public:secret` payload, or undefined if malformed. */
function decodeBasic(
  encoded: string,
): { publicKey: string; secretKey: string } | undefined {
  const [publicKey, secretKey] = atob(encoded).split(":");
  if (!publicKey || !secretKey) return undefined;
  return { publicKey, secretKey };
}
