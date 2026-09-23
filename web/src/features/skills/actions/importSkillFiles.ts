import { MAX_SKILL_FILES, SkillFilePathSchema } from "@langfuse/shared";
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
  if (
    Object.keys(store.getState().files).length + files.length >
    MAX_SKILL_FILES
  ) {
    throw new Error(`A skill can contain at most ${MAX_SKILL_FILES} files.`);
  }
  const paths = files.map((file) => {
    // file-selector prefixes dropped paths with "/" or "./".
    const path = (
      file.webkitRelativePath ||
      file.relativePath ||
      file.path ||
      file.name
    ).replace(/^(\.\/|\/)/, "");
    if (!SkillFilePathSchema.safeParse(path).success) {
      throw new Error(`Invalid file path: ${path}`);
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      throw new Error(`Files must be non-empty and at most 10 MiB: ${path}`);
    }
    return path;
  });
  const imports: SkillDraftFile[] = [];
  for (const [index, file] of files.entries()) {
    const path = paths[index]!;
    const bytes = await file.arrayBuffer();
    let content: string | undefined;
    try {
      const decoded = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      if (!decoded.includes("\0")) content = decoded;
    } catch {
      // Preserve binary files without decoding or modifying their bytes.
    }
    const contentType =
      file.type ||
      (content === undefined ? "application/octet-stream" : "text/plain");
    imports.push(
      content === undefined
        ? { path, contentType, blob: file }
        : { path, contentType, content },
    );
  }
  if (!imports.length) return paths;
  const state = store.getState();
  if (Object.keys(state.files).length + imports.length > MAX_SKILL_FILES) {
    throw new Error(`A skill can contain at most ${MAX_SKILL_FILES} files.`);
  }
  const nextFiles = { ...state.files };
  for (const file of imports) {
    if (
      state.folders.includes(file.path) ||
      Object.keys(nextFiles).some(
        (path) =>
          path === file.path ||
          path.startsWith(`${file.path}/`) ||
          file.path.startsWith(`${path}/`),
      )
    ) {
      throw new Error(
        `A file or folder already exists at ${file.path}. No files were added.`,
      );
    }
    nextFiles[file.path] = file;
  }
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
