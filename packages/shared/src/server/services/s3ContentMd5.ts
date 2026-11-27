import { createHash } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";

const MD5_COMMANDS = new Set(["PutObjectCommand", "UploadPartCommand"]);

type BuildArgs = {
  request?: { headers?: Record<string, string>; body?: unknown };
};
type BuildNext = (args: BuildArgs) => Promise<unknown>;
type BuildContext = { commandName?: string };

// Hash parts in slices, yielding between them, so a 100 MiB+ part does not
// hold the event loop (BullMQ lock renewal, other consumers) for its whole MD5.
const MD5_SLICE_BYTES = 4 * 1024 * 1024;

async function md5Base64(body: unknown): Promise<string | undefined> {
  if (typeof body === "string") {
    return createHash("md5").update(body, "utf8").digest("base64");
  }
  if (!(body instanceof Uint8Array)) return undefined;

  const hash = createHash("md5");
  for (let offset = 0; offset < body.byteLength; offset += MD5_SLICE_BYTES) {
    if (offset > 0) await new Promise((resolve) => setImmediate(resolve));
    hash.update(body.subarray(offset, offset + MD5_SLICE_BYTES));
  }
  return hash.digest("base64");
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

/**
 * Sends `Content-MD5` on `PutObject` and `UploadPart`.
 *
 * S3 buckets with Object Lock reject part and object writes that carry neither
 * `Content-MD5` nor an `x-amz-checksum-*` header. The client keeps
 * `requestChecksumCalculation: "WHEN_REQUIRED"` because the SDK's flexible
 * checksums put a composite checksum on `CompleteMultipartUpload`, which GCS's
 * S3-compatible API rejects with 412. `Content-MD5` is a per-request header,
 * accepted by AWS, GCS, MinIO and R2, and leaves multipart create/complete
 * untouched.
 *
 * Only in-memory bodies are hashed. Multipart parts are always buffered
 * (`BufferedStreamUploader` and lib-storage both slice streams into byte
 * arrays), so streaming bodies only reach here from callers that bypass both.
 * Hashing is skipped, not failed, where MD5 is unavailable (FIPS mode).
 */
export function addS3ContentMd5Middleware(client: S3Client): void {
  const middleware =
    (next: BuildNext, context: BuildContext) => async (args: BuildArgs) => {
      const headers = args.request?.headers;
      if (
        headers &&
        context.commandName &&
        MD5_COMMANDS.has(context.commandName) &&
        !hasHeader(headers, "content-md5")
      ) {
        try {
          const digest = await md5Base64(args.request?.body);
          if (digest) headers["content-md5"] = digest;
        } catch {
          // MD5 disabled (FIPS): send the request as before.
        }
      }
      return next(args);
    };

  // The stack's overloads resolve to the deserialize step under a plain cast.
  type AddBuildMiddleware = (
    middleware: (
      next: BuildNext,
      context: BuildContext,
    ) => (args: BuildArgs) => Promise<unknown>,
    options: { step: "build"; name: string; tags: string[]; override: true },
  ) => void;
  const stack = client.middlewareStack;
  (stack.add as unknown as AddBuildMiddleware).call(stack, middleware, {
    step: "build",
    name: "langfuseS3ContentMd5",
    tags: ["LANGFUSE", "CONTENT_MD5"],
    override: true,
  });
}
