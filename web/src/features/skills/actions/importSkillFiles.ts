import { SkillVersionFileInputSchema } from "@langfuse/shared";
import { unzipSync } from "fflate";
import { type FileWithPath } from "react-dropzone";
import { getParentFolderPaths } from "../components/skillFileTree";
import {
  createSkillDraftFile,
  type SkillDraftFile,
  type SkillEditorStore,
} from "../components/skillEditorStore";

export async function importSkillFiles(
  store: SkillEditorStore,
  files: FileWithPath[],
) {
  const imports: SkillDraftFile[] = [];
  const addTextFile = (path: string, bytes: Uint8Array) => {
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
    imports.push(createSkillDraftFile(result.data.path, result.data.content));
  };
  for (const file of files) {
    // file-selector prefixes dropped paths with "/" or "./".
    const path = (
      file.webkitRelativePath ||
      file.relativePath ||
      file.path ||
      file.name
    ).replace(/^(\.\/|\/)/, "");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(path)) {
      const archivePaths = new Set<string>();
      const entries = unzipSync(bytes, {
        filter: (entry) => {
          if (entry.name.endsWith("/")) return false;
          if (archivePaths.has(entry.name)) {
            throw new Error(`Duplicate ZIP entry: ${entry.name}`);
          }
          archivePaths.add(entry.name);
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
  const nextDeletedFiles = { ...state.deletedFiles };
  for (const file of imports) {
    if (
      state.folders.includes(file.path) ||
      [...Object.keys(nextFiles), ...Object.keys(nextDeletedFiles)].some(
        (path) =>
          path.startsWith(`${file.path}/`) || file.path.startsWith(`${path}/`),
      )
    ) {
      throw new Error(
        `A file or folder already exists at ${file.path}. No files were added.`,
      );
    }
    const existing = nextFiles[file.path] ?? nextDeletedFiles[file.path];
    nextFiles[file.path] = {
      ...file,
      sourceSha: existing?.sourceSha ?? null,
      sourceContentLength: existing?.sourceContentLength ?? null,
    };
    delete nextDeletedFiles[file.path];
  }
  const paths = imports.map((file) => file.path);
  store.setState({
    files: nextFiles,
    deletedFiles: nextDeletedFiles,
    folders: [
      ...new Set([...state.folders, ...getParentFolderPaths(paths)]),
    ].toSorted(),
    activePath: imports[0]!.path,
    dirty: true,
  });
  store.getState().actions.hashPendingFiles();
  return paths;
}
