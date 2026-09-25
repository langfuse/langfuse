import {
  MAX_SKILL_BYTES,
  MAX_SKILL_FILES,
  SkillVersionFileInputSchema,
} from "@langfuse/shared";
import { unzipSync } from "fflate";
import { type FileWithPath } from "react-dropzone";
import { getParentFolderPaths } from "../components/skillFileTree";
import {
  type SkillDraftFile,
  type SkillEditorStore,
} from "../components/skillEditorStore";

export async function importSkillFiles(
  store: SkillEditorStore,
  files: FileWithPath[],
) {
  const imports: SkillDraftFile[] = [];
  let importedBytes = 0;
  const checkBudget = (size: number) => {
    if (imports.length >= MAX_SKILL_FILES) {
      throw new Error(`A skill can contain at most ${MAX_SKILL_FILES} files.`);
    }
    if (size > MAX_SKILL_BYTES) {
      throw new Error(`Files must be at most ${MAX_SKILL_BYTES} bytes.`);
    }
    importedBytes += size;
    if (importedBytes > MAX_SKILL_BYTES) {
      throw new Error(`A skill can contain at most ${MAX_SKILL_BYTES} bytes.`);
    }
  };
  const addTextFile = (path: string, bytes: Uint8Array) => {
    checkBudget(bytes.byteLength);
    let content: string;
    try {
      content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      throw new Error(`Only UTF-8 text files are supported: ${path}`);
    }
    const result = SkillVersionFileInputSchema.safeParse({ path, content });
    if (!result.success) {
      throw new Error(`${path}: ${result.error.issues[0]!.message}`);
    }
    imports.push({ ...result.data, contentType: "text/plain" });
  };
  for (const file of files) {
    // file-selector prefixes dropped paths with "/" or "./".
    const path = (
      file.webkitRelativePath ||
      file.relativePath ||
      file.path ||
      file.name
    ).replace(/^(\.\/|\/)/, "");
    if (file.size > MAX_SKILL_BYTES) {
      throw new Error(
        `Files must be at most ${MAX_SKILL_BYTES} bytes: ${path}`,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(path)) {
      let expandedBytes = importedBytes;
      let expandedFiles = imports.length;
      const archivePaths = new Set<string>();
      const entries = unzipSync(bytes, {
        filter: (entry) => {
          if (entry.name.endsWith("/")) return false;
          if (archivePaths.has(entry.name)) {
            throw new Error(`Duplicate ZIP entry: ${entry.name}`);
          }
          archivePaths.add(entry.name);
          expandedBytes += entry.originalSize;
          expandedFiles += 1;
          // Check the expanded sizes before allocating decompression buffers.
          if (
            entry.originalSize > MAX_SKILL_BYTES ||
            expandedBytes > MAX_SKILL_BYTES ||
            expandedFiles > MAX_SKILL_FILES
          ) {
            throw new Error(
              "The ZIP exceeds the skill size or file count limit.",
            );
          }
          return true;
        },
      });
      for (const [entryPath, entryBytes] of Object.entries(entries)) {
        addTextFile(entryPath, entryBytes);
      }
    } else {
      addTextFile(path, bytes);
    }
  }
  if (!imports.length) return [];
  const state = store.getState();
  const nextFiles = { ...state.files };
  for (const file of imports) {
    if (
      state.folders.includes(file.path) ||
      Object.keys(nextFiles).some(
        (path) =>
          path.startsWith(`${file.path}/`) || file.path.startsWith(`${path}/`),
      )
    ) {
      throw new Error(
        `A file or folder already exists at ${file.path}. No files were added.`,
      );
    }
    nextFiles[file.path] = file;
  }
  if (Object.keys(nextFiles).length > MAX_SKILL_FILES) {
    throw new Error(`A skill can contain at most ${MAX_SKILL_FILES} files.`);
  }
  const totalBytes = Object.values(nextFiles).reduce(
    (total, file) =>
      total +
      (file.source?.contentLength ??
        new TextEncoder().encode(file.content).byteLength),
    0,
  );
  if (totalBytes > MAX_SKILL_BYTES) {
    throw new Error(`A skill can contain at most ${MAX_SKILL_BYTES} bytes.`);
  }
  const paths = imports.map((file) => file.path);
  store.setState({
    files: nextFiles,
    folders: [
      ...new Set([...state.folders, ...getParentFolderPaths(paths)]),
    ].toSorted(),
    activePath: imports[0]!.path,
    dirty: true,
  });
  return paths;
}
