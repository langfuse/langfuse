import { createStore, type StoreApi } from "zustand/vanilla";
import { MAX_SKILL_FILES, SkillFilePathSchema } from "@langfuse/shared";
import { getParentFolderPaths } from "./skillFileTree";
import { resetSkillName } from "../utils/resetSkillName";
import { hashSkillFileContent } from "../utils/hashSkillFileContent";
import { captureUnknownError } from "@/src/utils/captureUnknownError";

export type SkillDraftFile = {
  path: string;
  content?: string;
  currentSha: string | null;
  sourceSha: string | null;
  sourceContentLength: number | null;
};

export function createSkillDraftFile(
  path: string,
  content: string,
): SkillDraftFile {
  return {
    path,
    content,
    currentSha: null,
    sourceSha: null,
    sourceContentLength: null,
  };
}

export type SkillEditorInitialValue = {
  name: string;
  baseVersion: number | null;
  files: SkillDraftFile[];
  labels: string[];
  tags: string[];
};

type SkillEditorState = {
  name: string;
  baseVersion: number | null;
  files: Record<string, SkillDraftFile>;
  deletedFiles: Record<string, SkillDraftFile>;
  folders: string[];
  activePath: string;
  labels: string[];
  tags: string[];
  commitMessage: string;
  dirty: boolean;
  isImporting: boolean;
  actions: {
    hashPendingFiles: () => Promise<void>;
    selectFile: (path: string) => void;
    updateActiveFile: (content: string) => void;
    resetName: () => void;
    addFile: (file: SkillDraftFile) => boolean;
    moveFile: (path: string, targetFolder: string) => boolean;
    moveFolder: (path: string, targetFolder: string) => boolean;
    addFolder: (path: string) => boolean;
    deleteFile: (path: string) => void;
    restoreFile: (path: string) => boolean;
    deleteFolder: (path: string) => boolean;
    syncLabels: (labels: string[]) => void;
    syncTags: (tags: string[]) => void;
    setCommitMessage: (message: string) => void;
  };
};

export type SkillEditorStore = StoreApi<SkillEditorState>;

export function createSkillEditorStore(
  initialValue: SkillEditorInitialValue,
): SkillEditorStore {
  const files = Object.fromEntries(
    initialValue.files.map((file) => [file.path, file]),
  );
  const folders = getParentFolderPaths(
    initialValue.files.map(({ path }) => path),
  );

  const pendingHashes = new Map<string, Promise<void>>();
  const store = createStore<SkillEditorState>((set, get) => ({
    name: initialValue.name,
    baseVersion: initialValue.baseVersion,
    files,
    deletedFiles: {},
    folders,
    activePath: files["SKILL.md"] ? "SKILL.md" : initialValue.files[0]!.path,
    labels: initialValue.labels.filter((label) => label !== "latest"),
    tags: initialValue.tags,
    commitMessage: "",
    dirty: false,
    isImporting: false,
    actions: {
      hashPendingFiles: async () => {
        const contents = new Set(
          Object.values(get().files).flatMap((file) =>
            file.currentSha === null && file.content !== undefined
              ? [file.content]
              : [],
          ),
        );
        await Promise.all(
          [...contents].map((content) => {
            const pending = pendingHashes.get(content);
            if (pending) return pending;
            const task = hashSkillFileContent(content)
              .then((currentSha) => {
                set((state) => {
                  const matchingFiles = Object.entries(state.files).filter(
                    ([, file]) =>
                      file.currentSha === null && file.content === content,
                  );
                  if (!matchingFiles.length) return state;
                  return {
                    files: {
                      ...state.files,
                      ...Object.fromEntries(
                        matchingFiles.map(([path, file]) => [
                          path,
                          { ...file, currentSha },
                        ]),
                      ),
                    },
                  };
                });
              })
              .catch((error: unknown) => {
                captureUnknownError("skills.hashFileContent", error);
              })
              .finally(() => pendingHashes.delete(content));
            pendingHashes.set(content, task);
            return task;
          }),
        );
      },
      resetName: () => {
        const state = get();
        const file = state.files["SKILL.md"];
        if (!file || file.content === undefined) return;
        const content = resetSkillName(file.content, state.name);
        set({
          files: {
            ...state.files,
            "SKILL.md": {
              ...file,
              content,
              currentSha: null,
            },
          },
          dirty: true,
        });
        get().actions.hashPendingFiles();
      },
      selectFile: (path) => {
        if (get().files[path]) set({ activePath: path });
      },
      updateActiveFile: (content) => {
        set((state) => ({
          files: {
            ...state.files,
            [state.activePath]: {
              ...state.files[state.activePath]!,
              content,
              currentSha: null,
            },
          },
          dirty: true,
        }));
        get().actions.hashPendingFiles();
      },
      addFile: (file) => {
        const state = get();
        if (
          hasFilePathConflict(
            file.path,
            { ...state.files, ...state.deletedFiles },
            state.folders,
          )
        ) {
          return false;
        }
        set((state) => ({
          files: { ...state.files, [file.path]: file },
          folders: [
            ...new Set([
              ...state.folders,
              ...getParentFolderPaths([file.path]),
            ]),
          ].toSorted(),
          activePath: file.path,
          dirty: true,
        }));
        get().actions.hashPendingFiles();
        return true;
      },
      moveFile: (path, targetFolder) => {
        const state = get();
        const file = state.files[path];
        if (
          !file ||
          path === "SKILL.md" ||
          (targetFolder !== "" && !state.folders.includes(targetFolder))
        ) {
          return false;
        }
        const name = path.split("/").at(-1)!;
        const nextPath = targetFolder ? `${targetFolder}/${name}` : name;
        if (nextPath === path) return true;
        if (
          !SkillFilePathSchema.safeParse(nextPath).success ||
          hasFilePathConflict(
            nextPath,
            { ...state.files, ...state.deletedFiles },
            state.folders,
          )
        ) {
          return false;
        }
        const { [path]: _, ...remainingFiles } = state.files;
        set({
          files: { ...remainingFiles, [nextPath]: { ...file, path: nextPath } },
          activePath: state.activePath === path ? nextPath : state.activePath,
          dirty: true,
        });
        return true;
      },
      moveFolder: (path, targetFolder) => {
        const state = get();
        if (
          !state.folders.includes(path) ||
          (targetFolder !== "" && !state.folders.includes(targetFolder)) ||
          targetFolder === path ||
          targetFolder.startsWith(`${path}/`)
        )
          return false;

        const name = path.split("/").at(-1)!;
        const nextPath = targetFolder ? `${targetFolder}/${name}` : name;
        if (nextPath === path) return true;
        if (
          hasFilePathConflict(
            nextPath,
            { ...state.files, ...state.deletedFiles },
            state.folders,
          )
        )
          return false;

        const relocate = (entryPath: string) =>
          entryPath === path || entryPath.startsWith(`${path}/`)
            ? `${nextPath}${entryPath.slice(path.length)}`
            : entryPath;
        const nextFolders = state.folders.map(relocate).toSorted();
        const nextFiles = Object.fromEntries(
          Object.entries(state.files).map(([filePath, file]) => {
            const movedPath = relocate(filePath);
            return [
              movedPath,
              movedPath === filePath ? file : { ...file, path: movedPath },
            ];
          }),
        );
        const nextDeletedFiles = Object.fromEntries(
          Object.entries(state.deletedFiles).map(([filePath, file]) => {
            const movedPath = relocate(filePath);
            return [
              movedPath,
              movedPath === filePath ? file : { ...file, path: movedPath },
            ];
          }),
        );
        if (
          [
            ...nextFolders,
            ...Object.keys(nextFiles),
            ...Object.keys(nextDeletedFiles),
          ].some(
            (entryPath) => !SkillFilePathSchema.safeParse(entryPath).success,
          )
        )
          return false;

        set({
          files: nextFiles,
          deletedFiles: nextDeletedFiles,
          folders: nextFolders,
          activePath: relocate(state.activePath),
          dirty: true,
        });
        return true;
      },
      addFolder: (path) => {
        const state = get();
        if (
          state.folders.includes(path) ||
          hasFileAtOrAbove(path, { ...state.files, ...state.deletedFiles })
        ) {
          return false;
        }
        set({
          folders: [
            ...new Set([
              ...state.folders,
              ...getParentFolderPaths([`${path}/placeholder`]),
            ]),
          ].toSorted(),
          dirty: true,
        });
        return true;
      },
      deleteFile: (path) => {
        if (path === "SKILL.md" || !get().files[path]) return;
        set((state) => {
          const { [path]: file, ...remainingFiles } = state.files;
          return {
            files: remainingFiles,
            deletedFiles: file!.sourceSha
              ? { ...state.deletedFiles, [path]: file! }
              : state.deletedFiles,
            activePath:
              state.activePath === path ? "SKILL.md" : state.activePath,
            dirty: true,
          };
        });
      },
      restoreFile: (path) => {
        const state = get();
        const file = state.deletedFiles[path];
        if (!file || Object.keys(state.files).length >= MAX_SKILL_FILES)
          return false;
        const { [path]: _, ...remainingDeletedFiles } = state.deletedFiles;
        set({
          files: { ...state.files, [path]: file },
          deletedFiles: remainingDeletedFiles,
          activePath: path,
          dirty: true,
        });
        get().actions.hashPendingFiles();
        return true;
      },
      deleteFolder: (path) => {
        const state = get();
        const isEmpty =
          ![
            ...Object.keys(state.files),
            ...Object.keys(state.deletedFiles),
          ].some((filePath) => filePath.startsWith(`${path}/`)) &&
          !state.folders.some(
            (folderPath) =>
              folderPath !== path && folderPath.startsWith(`${path}/`),
          );
        if (!isEmpty) return false;
        set({
          folders: state.folders.filter((folderPath) => folderPath !== path),
          dirty: true,
        });
        return true;
      },
      syncLabels: (labels) => set({ labels: [...new Set(labels)] }),
      syncTags: (tags) => set({ tags: [...new Set(tags)] }),
      setCommitMessage: (commitMessage) => set({ commitMessage, dirty: true }),
    },
  }));
  store.getState().actions.hashPendingFiles();
  return store;
}

function hasFileAtOrAbove(
  path: string,
  files: Record<string, SkillDraftFile>,
): boolean {
  const segments = path.split("/");
  return segments.some((_, index) =>
    Boolean(files[segments.slice(0, index + 1).join("/")]),
  );
}

function hasFilePathConflict(
  path: string,
  files: Record<string, SkillDraftFile>,
  folders: string[],
): boolean {
  return (
    hasFileAtOrAbove(path, files) ||
    folders.includes(path) ||
    Object.keys(files).some((filePath) => filePath.startsWith(`${path}/`))
  );
}
