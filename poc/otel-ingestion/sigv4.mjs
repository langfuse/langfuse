// Minimal AWS SigV4 signer (header auth, path-style) for MinIO and real S3.
// Node stdlib only. Real-S3 use: POC_S3_REGION must match the endpoint's
// region, and POC_S3_SESSION_TOKEN carries STS/SSO temporary credentials.
import { createHash, createHmac } from "node:crypto";

const sha256hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

export function signedFetch({
  method,
  endpoint, // e.g. http://127.0.0.1:9090 or https://s3.eu-west-1.amazonaws.com
  path, // e.g. /langfuse/otel-poc/p1/w0/x.json (URI path, already encoded)
  body = undefined,
  accessKey,
  secretKey,
  region = process.env.POC_S3_REGION ?? "us-east-1",
  sessionToken = process.env.POC_S3_SESSION_TOKEN,
}) {
  // a trailing slash would make the wire path "//bucket/..." while the
  // signature covers "/bucket/..." — normalize instead of failing signed
  endpoint = endpoint.replace(/\/+$/, "");
  const url = new URL(endpoint);
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body ?? "");

  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    path,
    "", // query string (none needed for PUT/GET object)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  let key = hmac(`AWS4${secretKey}`, dateStamp);
  key = hmac(key, region);
  key = hmac(key, "s3");
  key = hmac(key, "aws4_request");
  const signature = createHmac("sha256", key)
    .update(stringToSign)
    .digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(`${endpoint}${path}`, {
    method,
    headers: { ...headers, authorization },
    body,
  });
}
