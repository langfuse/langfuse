import { createHmac, timingSafeEqual } from "node:crypto";

export function signHmacSha256(message: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(message, "utf8")
    .digest("base64url");
}

export function verifyHmacSha256(input: {
  message: string;
  signature: string;
  secrets: string[];
}): boolean {
  const signature = Buffer.from(input.signature, "utf8");

  return input.secrets.some((secret) => {
    const expected = Buffer.from(signHmacSha256(input.message, secret), "utf8");
    return (
      signature.length === expected.length &&
      timingSafeEqual(signature, expected)
    );
  });
}
