import { zipSync } from "fflate";

function saveArchive(archive: Blob, filename: string) {
  const url = URL.createObjectURL(archive);
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
  }) => Promise<{
    createdAt: Date;
    files: Array<{ id: string; path: string }>;
  }>;
  getFileContent: (input: {
    projectId: string;
    fileId: string;
  }) => Promise<{ content: string }>;
  saveArchive?: (archive: Blob, filename: string) => void;
}): Promise<{ fileCount: number }> {
  const skill = await params.getVersion({
    projectId: params.projectId,
    name: params.name,
    version: params.version,
  });
  const files: Record<string, Uint8Array> = {};
  const pendingFiles = skill.files.values();
  await Promise.all(
    Array.from({ length: Math.min(4, skill.files.length) }, async () => {
      for (const file of pendingFiles) {
        const { content } = await params.getFileContent({
          projectId: params.projectId,
          fileId: file.id,
        });
        files[file.path] = new TextEncoder().encode(content);
      }
    }),
  );
  const archive = new Blob(
    [
      new Uint8Array(zipSync(files, { level: 6, mtime: skill.createdAt }))
        .buffer,
    ],
    { type: "application/zip" },
  );
  (params.saveArchive ?? saveArchive)(
    archive,
    `${params.name}-v${params.version}.zip`,
  );
  return { fileCount: skill.files.length };
}
