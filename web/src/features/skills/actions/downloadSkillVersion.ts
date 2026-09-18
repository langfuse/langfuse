import { zip, type Zippable, type ZipOptions } from "fflate";

type DownloadableSkillVersion = {
  createdAt: Date;
  files: Array<{
    path: string;
    executable: boolean;
    downloadUrl: string;
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
        const response = await fetchFile(file.downloadUrl);
        if (!response.ok) {
          throw new Error(`Skill file download failed (${response.status})`);
        }
        const options: ZipOptions = {
          os: 3,
          attrs: (file.executable ? 0o755 : 0o644) * 65_536,
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
