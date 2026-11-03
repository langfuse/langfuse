import { MAX_SKILL_BYTES } from "@langfuse/shared";
import { discoverFileSkills, readSkillArchive } from "./archive-import";
import { MAX_SKILL_ZIP_UPLOAD_BYTES } from "./importLimits";

const MAX_LOCAL_BYTES = 20 * 1024 * 1024;

export async function discoverLocalSkills(
  inputs: { path: string; file: File }[],
) {
  if (inputs.length > 10_000)
    throw new Error("Select at most 10,000 files per import.");

  // Folder drops have relative directory paths; only scan directly selected ZIPs.
  const archives = inputs.filter(
    ({ path }) => !path.includes("/") && path.toLowerCase().endsWith(".zip"),
  );
  const ordinaryFiles = inputs.filter(
    ({ path }) => !path.toLowerCase().endsWith(".zip"),
  );
  const skillDirectories = ordinaryFiles
    .filter(({ path }) => path.split("/").at(-1)?.toLowerCase() === "skill.md")
    .map(({ path }) => path.slice(0, path.lastIndexOf("/") + 1));
  if (skillDirectories.length > 100)
    throw new Error("A source can contain at most 100 skills per import.");

  // Inspect paths before reading content so unrelated repository files are skipped.
  const relevantFiles = ordinaryFiles.filter(({ path }) =>
    skillDirectories.some((directory) => path.startsWith(directory)),
  );
  for (const { path, file } of [...relevantFiles, ...archives]) {
    const isArchive = path.toLowerCase().endsWith(".zip");
    if (file.size > (isArchive ? MAX_SKILL_ZIP_UPLOAD_BYTES : MAX_SKILL_BYTES))
      throw new Error(
        isArchive
          ? "ZIP files must be 3 MB or smaller."
          : "Skill files must be 1 MB or smaller.",
      );
  }
  if (
    [...relevantFiles, ...archives].reduce(
      (total, { file }) => total + file.size,
      0,
    ) > MAX_LOCAL_BYTES
  )
    throw new Error(
      "The selected skill files and ZIPs must total 20 MB or less.",
    );

  const files: { path: string; bytes: Uint8Array }[] = [];
  const sourceRoots: string[] = [];
  const sourceDirectories = new Set(
    ordinaryFiles.map(({ path }) => path.split("/")[0]!),
  );
  let expandedBytes = 0;
  for (const { path, file } of [...relevantFiles, ...archives]) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let archiveDirectory = path.slice(0, -4) || path;
    if (path.toLowerCase().endsWith(".zip")) {
      for (let suffix = 2; sourceDirectories.has(archiveDirectory); suffix++)
        archiveDirectory = `${path} (${suffix})`;
      sourceDirectories.add(archiveDirectory);
      sourceRoots.push(`${archiveDirectory}/`);
    }
    const entries = path.toLowerCase().endsWith(".zip")
      ? readSkillArchive(bytes, MAX_LOCAL_BYTES - expandedBytes).map(
          (entry) => ({
            ...entry,
            path: `${archiveDirectory}/${entry.path}`,
          }),
        )
      : [{ path, bytes }];
    for (const entry of entries) {
      expandedBytes += entry.bytes.byteLength;
      if (expandedBytes > MAX_LOCAL_BYTES)
        throw new Error("The expanded skill files must total 20 MB or less.");
      files.push(entry);
      if (files.length > 10_000)
        throw new Error("Select at most 10,000 files per import.");
    }
  }
  return discoverFileSkills({
    files,
    fallbackName: "Local files",
    sourceRoots,
  });
}
