import { createHash } from "node:crypto";
import {
  otelMediaUploads,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import type { OtelWriteTarget } from "../otel-ingestion/processingHooks";

type Destination = Omit<
  Parameters<typeof uploadMediaForTrace>[0],
  "contentBytes" | "sha256Hash"
>;
type MediaIdentity = Omit<Destination, "mediaBucket" | "mediaPrefix"> & {
  sha256Hash: string;
};
export type OtelMediaUploadResult = Awaited<
  ReturnType<typeof uploadMediaForTrace>
> & { byteLength: number };
type PrimaryWrite = () => Promise<OtelMediaUploadResult>;
export type OtelMediaWrite = (
  request: MediaIdentity,
  primary: PrimaryWrite,
) => Promise<OtelMediaUploadResult>;

// Capture uploads and cache-hit associations at the same boundary. Both link one field to one asset.
export async function writeOtelMedia(
  target: OtelWriteTarget,
  stage: "media_upload" | "media_association",
  identity: MediaIdentity,
  primary: PrimaryWrite,
) {
  if (target === "primary") return primary();
  try {
    return await target.media(identity, primary);
  } catch (error) {
    target.onFailure?.(stage);
    throw error;
  }
}

export async function uploadOtelMedia(
  target: OtelWriteTarget,
  destination: Destination,
  source:
    | string
    | Buffer
    | {
        sha256Hash: string;
        byteLengthUpperBound: number;
        loadBody: () => Promise<Buffer>;
      },
) {
  const body =
    typeof source === "string" ? Buffer.from(source, "utf8") : source;
  const sha256Hash = Buffer.isBuffer(body)
    ? createHash("sha256").update(body).digest("base64")
    : body.sha256Hash;
  const request = { ...destination, sha256Hash };
  const store = async (contentBytes: Buffer) => ({
    ...(await uploadMediaForTrace({ ...request, contentBytes })),
    byteLength: contentBytes.length,
  });
  return writeOtelMedia(target, "media_upload", request, () =>
    Buffer.isBuffer(body)
      ? store(body)
      : otelMediaUploads.run(body.byteLengthUpperBound, async () =>
          store(await body.loadBody()),
        ),
  );
}
