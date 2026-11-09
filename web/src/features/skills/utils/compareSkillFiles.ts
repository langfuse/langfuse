type FileReference = { path: string; sha256Hash: string | null };

export function compareSkillFiles(
  before: FileReference[],
  after: FileReference[],
) {
  const oldFiles = new Map(before.map((file) => [file.path, file]));
  const newFiles = new Map(after.map((file) => [file.path, file]));
  return [...new Set([...oldFiles.keys(), ...newFiles.keys()])]
    .map((path) => {
      const oldFile = oldFiles.get(path);
      const newFile = newFiles.get(path);
      let status: "Added" | "Removed" | "Modified" | "Unchanged" = "Modified";
      if (!oldFile) status = "Added";
      else if (!newFile) status = "Removed";
      else if (
        oldFile.sha256Hash !== null &&
        oldFile.sha256Hash === newFile.sha256Hash
      )
        status = "Unchanged";
      return { path, oldFile, newFile, status };
    })
    .sort((a, b) => {
      const unchanged =
        Number(a.status === "Unchanged") - Number(b.status === "Unchanged");
      if (unchanged) return unchanged;
      if (a.path === "SKILL.md") return -1;
      if (b.path === "SKILL.md") return 1;
      return a.path.localeCompare(b.path);
    });
}
