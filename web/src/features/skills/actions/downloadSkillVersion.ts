import { zip, type Zippable, type ZipOptions } from "fflate";

type DownloadableSkillVersion = {
  createdAt: Date;
  files: Array<{
    id: string;
    path: string;
  }>;
};

type FetchSkillFile = (url: string) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

function createZip(entries: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, archive) => {
      if (error) reject(error);
      else resolve(archive);
    });
  });
}

function saveArchive(archive: Uint8Array, filename: string) {
  const blobBytes = new Uint8Array(archive.byteLength);
  blobBytes.set(archive);
  const url = URL.createObjectURL(
    new Blob([blobBytes.buffer], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  saveArchive?: (archive: Uint8Array, filename: string) => void;
}): Promise<{ fileCount: number }> {
  const skill = await params.getVersion({
    projectId: params.projectId,
    name: params.name,
    version: params.version,
  });
  const fetchFile = params.fetchFile ?? fetch;
  const entries = Object.fromEntries(
    await Promise.all(
      skill.files.map(async (file) => {
        const { downloadUrl } = await params.getFileDownload({
          projectId: params.projectId,
          fileId: file.id,
        });
        const response = await fetchFile(downloadUrl);
        if (!response.ok) {
          throw new Error(`Skill file download failed (${response.status})`);
        }
        const options: ZipOptions = {
          mtime: skill.createdAt,
        };
        return [
          file.path,
          [new Uint8Array(await response.arrayBuffer()), options],
        ] as [string, Zippable[string]];
      }),
    ),
  ) as Zippable;
  const archive = await createZip(entries);

  (params.saveArchive ?? saveArchive)(
    archive,
    `${params.name}-v${params.version}.zip`,
  );
  return { fileCount: skill.files.length };
}
