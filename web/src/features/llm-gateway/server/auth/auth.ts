import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const RESOLVE_METHOD = "POST";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";

type GatewayHmacMessageInput = {
  timestamp: number;
  virtualSecretKey: string;
  requestBody: string;
};

type GatewayServiceKey = {
  secret: string;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function buildGatewayHmacCanonicalMessage(
  input: GatewayHmacMessageInput,
): string {
  return [
    input.timestamp.toString(),
    sha256(input.virtualSecretKey),
    RESOLVE_PATH,
    RESOLVE_METHOD,
    sha256(input.requestBody),
  ].join("\n");
}

function createGatewayHmacSignature(
  input: GatewayHmacMessageInput & { serviceKey: string },
): string {
  return createHmac("sha256", input.serviceKey)
    .update(buildGatewayHmacCanonicalMessage(input), "utf8")
    .digest("base64url");
}

export function verifyGatewayHmacAuthorization(input: {
  header: string | undefined;
  virtualSecretKey: string;
  requestBody: string;
  keys: GatewayServiceKey[];
  now?: Date;
}): boolean {
  const match = /^HMAC timestamp=(\d+),signature=([A-Za-z0-9_-]{43})$/.exec(
    input.header ?? "",
  );
  if (!match) return false;

  const [, timestampValue, signature] = match;
  const timestamp = Number(timestampValue);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) {
    return false;
  }
  return input.keys.some((key) =>
    safeEqual(
      signature,
      createGatewayHmacSignature({
        timestamp,
        virtualSecretKey: input.virtualSecretKey,
        requestBody: input.requestBody,
        serviceKey: key.secret,
      }),
    ),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
