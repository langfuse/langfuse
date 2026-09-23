import { AsyncZipDeflate, Zip } from "fflate";

const DOWNLOAD_CONCURRENCY = 10;

type DownloadableSkillVersion = {
  createdAt: Date;
  files: Array<{
    id: string;
    path: string;
  }>;
};

type FetchSkillFile = (
  url: string,
  init: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}>;

async function streamFileToZip(
  zip: Zip,
  body: ReadableStream<Uint8Array>,
  path: string,
  mtime: Date,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const entry = new AsyncZipDeflate(path, { level: 6 });
  entry.mtime = mtime;
  zip.add(entry);
  const reader = body.getReader();
  const ondata = entry.ondata;
  let onAbort: () => void;
  const finished = new Promise<void>((resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    entry.ondata = (error, chunk, final) => {
      ondata(error, chunk, final);
      if (error) reject(error);
      else if (final) resolve();
    };
  });

  try {
    await Promise.all([
      finished,
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          signal.throwIfAborted();
          entry.push(value ?? new Uint8Array(0), done);
          if (done) return;
        }
      })(),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort!);
    entry.terminate();
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function saveArchive(archive: Blob, filename: string) {
  const url = URL.createObjectURL(archive);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function createArchive(
  skill: DownloadableSkillVersion,
  downloadFile: (
    fileId: string,
    signal: AbortSignal,
  ) => ReturnType<FetchSkillFile>,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const chunks: BlobPart[] = [];
    const fail = (error: unknown) => {
      controller.abort(error);
      zip.terminate();
      chunks.length = 0;
      reject(error);
    };
    const zip = new Zip((error, chunk, final) => {
      if (error) return fail(error);
      // Blob parts avoid concatenating and copying the entire archive at the end.
      chunks.push(new Uint8Array(chunk).buffer);
      if (final) resolve(new Blob(chunks, { type: "application/zip" }));
    });

    let nextFile = 0;
    const downloadNext = async () => {
      while (nextFile < skill.files.length) {
        controller.signal.throwIfAborted();
        const file = skill.files[nextFile++]!;
        const response = await downloadFile(file.id, controller.signal);
        if (!response.ok) {
          throw new Error(`Skill file download failed (${response.status})`);
        }
        if (!response.body) throw new Error("Skill file download has no body");
        // Hold the slot until compression finishes, bounding worker input too.
        await streamFileToZip(
          zip,
          response.body,
          file.path,
          skill.createdAt,
          controller.signal,
        );
      }
    };
    Promise.all(
      Array.from(
        { length: Math.min(DOWNLOAD_CONCURRENCY, skill.files.length) },
        downloadNext,
      ),
    )
      .then(() => zip.end())
      .catch(fail);
  });
}

export async function downloadSkillVersion(params: {
  projectId: string;
  name: string;
  version: number;
  getVersion: (input: {
    projectId: string;
    name: string;
    version: number;
  }) => Promise<DownloadableSkillVersion>;
  getFileDownload: (input: {
    projectId: string;
    fileId: string;
  }) => Promise<{ downloadUrl: string }>;
  fetchFile?: FetchSkillFile;
  saveArchive?: (archive: Blob, filename: string) => void;
}): Promise<{ fileCount: number }> {
  const skill = await params.getVersion({
    projectId: params.projectId,
    name: params.name,
    version: params.version,
  });
  const fetchFile = params.fetchFile ?? fetch;
  const archive = await createArchive(skill, async (fileId, signal) => {
    const { downloadUrl } = await params.getFileDownload({
      projectId: params.projectId,
      fileId,
    });
    signal.throwIfAborted();
    return fetchFile(downloadUrl, { signal });
  });

  (params.saveArchive ?? saveArchive)(
    archive,
    `${params.name}-v${params.version}.zip`,
  );
  return { fileCount: skill.files.length };
}
