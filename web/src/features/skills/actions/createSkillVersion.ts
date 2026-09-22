import { Sha256 } from "@aws-crypto/sha256-browser";
import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";

type PreparedUpload = {
  sha256Hash: string;
  contentType: string;
  contentLength: number;
  blobId: string;
  uploadUrl: string | null;
};

type PrepareUploads = (input: {
  projectId: string;
  blobs: Array<{
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }>;
}) => Promise<{ data: PreparedUpload[] }>;

type CreateVersion = (input: {
  projectId: string;
  files: Array<{ path: string; blobId: string }>;
  labels: string[];
  tags: string[];
  commitMessage: string | null;
}) => Promise<{ id: string; name: string; version: number }>;

async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const hash = new Sha256();
  hash.update(bytes);
  const digest = await hash.digest();
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function uploadHeaders(upload: PreparedUpload): Headers {
  const headers = new Headers({ "Content-Type": upload.contentType });
  if (!upload.uploadUrl) return headers;

  const url = new URL(upload.uploadUrl);
  const usesAwsChecksum =
    url.searchParams.has("X-Amz-Algorithm") || url.searchParams.has("sv");
  if (usesAwsChecksum) {
    headers.set("x-amz-checksum-sha256", upload.sha256Hash);
  }
  if (url.searchParams.has("sv")) {
    headers.set("x-ms-blob-type", "BlockBlob");
    const storageVersion = url.searchParams.get("sv");
    if (storageVersion) headers.set("x-ms-version", storageVersion);
  }
  return headers;
}

export async function createSkillVersionFromDraft(params: {
  projectId: string;
  store: SkillEditorStore;
  prepareUploads: PrepareUploads;
  createVersion: CreateVersion;
}) {
  const draft = params.store.getState();
  const files = Object.values(draft.files);
  const encodedFiles = await Promise.all(
    files
      .filter((file) => file.content !== undefined)
      .map(async (file) => {
        const bytes = new TextEncoder().encode(file.content);
        return { file, bytes, sha256Hash: await sha256Base64(bytes) };
      }),
  );

  const uniqueBlobs = new Map<
    string,
    { sha256Hash: string; contentType: string; contentLength: number }
  >();
  for (const { file, bytes, sha256Hash } of encodedFiles) {
    if (!uniqueBlobs.has(sha256Hash)) {
      uniqueBlobs.set(sha256Hash, {
        sha256Hash,
        contentType: file.contentType,
        contentLength: bytes.byteLength,
      });
    }
  }

  const prepared = uniqueBlobs.size
    ? await params.prepareUploads({
        projectId: params.projectId,
        blobs: [...uniqueBlobs.values()],
      })
    : { data: [] };
  const uploadByHash = new Map(
    prepared.data.map((upload) => [upload.sha256Hash, upload]),
  );

  await Promise.all(
    [...uniqueBlobs.keys()].map(async (sha256Hash) => {
      const upload = uploadByHash.get(sha256Hash)!;
      if (!upload.uploadUrl) return;
      const bytes = encodedFiles.find(
        (file) => file.sha256Hash === sha256Hash,
      )!.bytes;
      const response = await fetch(upload.uploadUrl, {
        method: "PUT",
        body: bytes,
        headers: uploadHeaders(upload),
      });
      if (!response.ok) {
        throw new Error(`File upload failed with status ${response.status}`);
      }
    }),
  );

  const uploadedBlobByPath = new Map(
    encodedFiles.map(({ file, sha256Hash }) => [
      file.path,
      uploadByHash.get(sha256Hash)!.blobId,
    ]),
  );
  return params.createVersion({
    projectId: params.projectId,
    files: files.map((file) => ({
      path: file.path,
      blobId: file.source?.blobId ?? uploadedBlobByPath.get(file.path)!,
    })),
    labels: draft.labels,
    tags: draft.tags,
    commitMessage: draft.commitMessage.trim() || null,
  });
}
