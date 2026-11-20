/** basicPrefix is the HTTP Basic auth scheme prefix. */
const basicPrefix = "Basic ";

/** bearerPrefix is the HTTP Bearer auth scheme prefix. */
const bearerPrefix = "Bearer ";

/** Credential is the parsed Authorization wire format — a scheme, never a verification outcome. */
export type Credential =
  | { kind: "basic"; publicKey: string; secretKey: string }
  | { kind: "bearer"; token: string }
  | { kind: "malformed" };

/** containsNulByte reports a credential no key can match: Postgres text cannot store NUL and rejects it in a query. */
export function containsNulByte(value: string): boolean {
  return value.includes("\u0000");
}

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
    const token = header.slice(bearerPrefix.length);
    if (containsNulByte(token)) return { kind: "malformed" };
    return { kind: "bearer", token };
  }
  return { kind: "malformed" };
}

/** decodeBasic decodes a base64 `public:secret` payload, or undefined if malformed. */
function decodeBasic(
  encoded: string,
): { publicKey: string; secretKey: string } | undefined {
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return undefined;
  }
  const [publicKey, secretKey] = decoded.split(":");
  if (!publicKey || !secretKey) return undefined;
  if (containsNulByte(publicKey) || containsNulByte(secretKey))
    return undefined;
  return { publicKey, secretKey };
}
