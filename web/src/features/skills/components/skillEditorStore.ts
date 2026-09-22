import { createStore, type StoreApi } from "zustand/vanilla";
import { getParentFolderPaths } from "./skillFileTree";

export type SkillDraftFile = {
  path: string;
  contentType: string;
} & (
  | { content: string; source?: never }
  | { content?: never; source: { fileId: string; blobId: string } }
);

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
  folders: string[];
  activePath: string;
  labels: string[];
  tags: string[];
  commitMessage: string;
  dirty: boolean;
  actions: {
    selectFile: (path: string) => void;
    updateActiveFile: (content: string) => void;
    addFile: (file: SkillDraftFile) => boolean;
    addFolder: (path: string) => boolean;
    deleteFile: (path: string) => void;
    deleteFolder: (path: string) => boolean;
    setLabels: (labels: string[]) => void;
    syncLabels: (labels: string[]) => void;
    setTags: (tags: string[]) => void;
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

  return createStore<SkillEditorState>((set, get) => ({
    name: initialValue.name,
    baseVersion: initialValue.baseVersion,
    files,
    folders,
    activePath: files["SKILL.md"] ? "SKILL.md" : initialValue.files[0]!.path,
    labels: initialValue.labels.filter((label) => label !== "latest"),
    tags: initialValue.tags,
    commitMessage: "",
    dirty: false,
    actions: {
      selectFile: (path) => {
        if (get().files[path]) set({ activePath: path });
      },
      updateActiveFile: (content) =>
        set((state) => ({
          files: {
            ...state.files,
            [state.activePath]: {
              path: state.activePath,
              contentType: state.files[state.activePath]!.contentType,
              content,
            },
          },
          dirty: true,
        })),
      addFile: (file) => {
        const state = get();
        if (hasFilePathConflict(file.path, state.files, state.folders)) {
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
        return true;
      },
      addFolder: (path) => {
        const state = get();
        if (
          state.folders.includes(path) ||
          hasFileAtOrAbove(path, state.files)
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
        if (path === "SKILL.md") return;
        set((state) => {
          const { [path]: _, ...remainingFiles } = state.files;
          return {
            files: remainingFiles,
            activePath:
              state.activePath === path ? "SKILL.md" : state.activePath,
            dirty: true,
          };
        });
      },
      deleteFolder: (path) => {
        const state = get();
        const isEmpty =
          !Object.keys(state.files).some((filePath) =>
            filePath.startsWith(`${path}/`),
          ) &&
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
      setLabels: (labels) => set({ labels: [...new Set(labels)], dirty: true }),
      syncLabels: (labels) => set({ labels: [...new Set(labels)] }),
      setTags: (tags) => set({ tags: [...new Set(tags)], dirty: true }),
      syncTags: (tags) => set({ tags: [...new Set(tags)] }),
      setCommitMessage: (commitMessage) => set({ commitMessage, dirty: true }),
    },
  }));
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
