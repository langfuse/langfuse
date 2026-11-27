import {
  type InAppAgentEditSkillDraftArgs,
  type InAppAgentSkillDraftOutcome,
  type InAppAgentSkillDraftSnapshot,
  type InAppAgentSkillDraftTarget,
} from "@langfuse/shared/in-app-agent";
import { SkillFilePathSchema } from "@langfuse/shared";
import { createSkillVersionFromDraft } from "@/src/features/skills/actions/createSkillVersion";
import {
  NEW_SKILL_INITIAL_VALUE,
  toSkillEditorInitialValue,
} from "@/src/features/skills/components/SkillEditor";
import {
  clearSkillDraft,
  createStoreForStoredSkillDraft,
  flushSkillDraft,
  readSkillDraft,
  releaseSkillDraft,
  reloadSkillDraft,
  skillDraftStorageKey,
  writeSkillDraft,
} from "@/src/features/skills/components/skillDraftStorage";
import {
  createSkillDraftFile,
  createSkillEditorStore,
  type SkillEditorStore,
} from "@/src/features/skills/components/skillEditorStore";
import { parseSkillFrontmatterMetadata } from "@/src/features/skills/utils/parseSkillFrontmatterMetadata";
import { type RouterInputs } from "@/src/utils/api";

/**
 * Halo's side of the skill draft the editor keeps in session storage. Halo
 * edits, reads, and saves the same draft the user sees, so they can take
 * turns on it.
 */

type LatestSkillVersion = {
  id: string;
  name: string;
  version: number;
  labels: string[];
  tags: string[];
  files: { path: string; sha256Hash: string; contentLength: number }[];
};

type HaloSkillDraftContext = {
  projectId: string;
  /** The skill's latest version, or null when there is no such skill. */
  findLatestVersion: (name: string) => Promise<LatestSkillVersion | null>;
};

export type HaloSkillDraftEdit = {
  draft: InAppAgentSkillDraftSnapshot;
  /** Where the draft opens in the editor, once it was changed. */
  href?: string;
  /** Call after opening `href`, so an editor already showing it resumes it. */
  reload?: () => void;
};

/** Applies Halo's changes to the stored draft, starting one if needed. */
export async function editSkillDraftForHalo(
  context: HaloSkillDraftContext,
  args: InAppAgentEditSkillDraftArgs,
): Promise<HaloSkillDraftEdit> {
  const invalidPath = [
    ...(args.files ?? []).map((file) => file.path),
    ...(args.deletedPaths ?? []),
  ].find((path) => !SkillFilePathSchema.safeParse(path).success);
  if (invalidPath !== undefined) {
    return {
      draft: { status: "error", message: `Invalid path: ${invalidPath}` },
    };
  }

  const key = getKey(context.projectId, args);
  releaseSkillDraft(key);
  const draft = await loadOrStartDraft(context, args);
  if ("error" in draft) {
    return { draft: { status: "error", message: draft.error } };
  }

  const failedPaths = applyEdit(draft.store, args);
  await draft.store.getState().actions.hashPendingFiles();
  writeSkillDraft(key, draft.store, draft.baseVersionId);

  const snapshot = toSnapshot(context.projectId, draft.store);
  return {
    draft: failedPaths.length
      ? {
          status: "error",
          message: `Could not add ${failedPaths.join(", ")}: a file or folder with that path already exists. Your other changes were applied.`,
        }
      : snapshot,
    href: snapshot.href,
    reload: () => reloadSkillDraft(key),
  };
}

export async function readSkillDraftForHalo(
  context: { projectId: string },
  target: InAppAgentSkillDraftTarget,
): Promise<InAppAgentSkillDraftSnapshot> {
  const key = getKey(context.projectId, target);
  flushSkillDraft(key);
  const stored = readSkillDraft(key);
  if (!stored) return { status: "notFound" };

  const store = createStoreForStoredSkillDraft(stored);
  await store.getState().actions.hashPendingFiles();
  return toSnapshot(context.projectId, store);
}

/** Publishes the stored draft as a new skill version. */
export async function saveSkillDraftForHalo(
  context: {
    projectId: string;
    createVersion: (
      input: RouterInputs["skills"]["createVersion"],
    ) => Promise<{ id: string; name: string; version: number }>;
  },
  target: InAppAgentSkillDraftTarget,
): Promise<InAppAgentSkillDraftOutcome> {
  const key = getKey(context.projectId, target);
  flushSkillDraft(key);
  const stored = readSkillDraft(key);
  if (!stored) return { status: "notFound" };

  const store = createStoreForStoredSkillDraft(stored);
  await store.getState().actions.hashPendingFiles();
  const created = await createSkillVersionFromDraft({
    projectId: context.projectId,
    store,
    createVersion: context.createVersion,
  });
  releaseSkillDraft(key);
  clearSkillDraft(key);
  reloadSkillDraft(key);
  return { status: "created", name: created.name, version: created.version };
}

function getKey(projectId: string, target: InAppAgentSkillDraftTarget) {
  return skillDraftStorageKey(projectId, target.skillName ?? null);
}

async function loadOrStartDraft(
  context: HaloSkillDraftContext,
  target: InAppAgentSkillDraftTarget,
): Promise<
  { store: SkillEditorStore; baseVersionId: string | null } | { error: string }
> {
  const stored = readSkillDraft(getKey(context.projectId, target));
  if (stored) {
    return {
      store: createStoreForStoredSkillDraft(stored),
      baseVersionId: stored.baseVersionId,
    };
  }
  if (!target.skillName) {
    return {
      store: createSkillEditorStore(NEW_SKILL_INITIAL_VALUE),
      baseVersionId: null,
    };
  }

  const latest = await context.findLatestVersion(target.skillName);
  if (!latest) {
    return {
      error: `There is no skill named '${target.skillName}'. Omit skillName to draft a new skill.`,
    };
  }
  return {
    store: createSkillEditorStore(
      toSkillEditorInitialValue({
        ...latest,
        files: latest.files.map((file) => ({
          path: file.path,
          currentSha: file.sha256Hash,
          sourceSha: file.sha256Hash,
          sourceContentLength: file.contentLength,
        })),
      }),
    ),
    baseVersionId: latest.id,
  };
}

/** Returns the paths that could not be added. */
function applyEdit(
  store: SkillEditorStore,
  edit: InAppAgentEditSkillDraftArgs,
): string[] {
  const { actions } = store.getState();
  const failedPaths: string[] = [];

  for (const file of edit.files ?? []) {
    if (store.getState().deletedFiles[file.path]) {
      actions.restoreFile(file.path);
    }
    if (store.getState().files[file.path]) {
      actions.selectFile(file.path);
      actions.updateActiveFile(file.content);
    } else if (
      !actions.addFile(createSkillDraftFile(file.path, file.content))
    ) {
      failedPaths.push(file.path);
    }
  }
  for (const path of edit.deletedPaths ?? []) {
    actions.deleteFile(path);
  }
  if (edit.commitMessage !== undefined) {
    actions.setCommitMessage(edit.commitMessage);
  }
  return failedPaths;
}

function toSnapshot(
  projectId: string,
  store: SkillEditorStore,
): Extract<InAppAgentSkillDraftSnapshot, { status: "open" }> {
  const state = store.getState();
  const skillMarkdown = state.files["SKILL.md"]?.content;
  const metadata = skillMarkdown
    ? parseSkillFrontmatterMetadata(skillMarkdown)
    : null;

  return {
    status: "open",
    name: metadata?.name.trim() || state.name,
    baseVersion: state.baseVersion,
    href:
      state.baseVersion === null
        ? `/project/${encodeURIComponent(projectId)}/skills/new?draft=true`
        : `/project/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(state.name)}?version=${state.baseVersion}&draft=true`,
    files: Object.values(state.files).map((file) => {
      if (file.sourceSha === null) {
        return { path: file.path, status: "added", content: file.content };
      }
      return file.currentSha === file.sourceSha
        ? { path: file.path, status: "unchanged" }
        : { path: file.path, status: "modified", content: file.content };
    }),
    deletedPaths: Object.keys(state.deletedFiles),
    commitMessage: state.commitMessage,
  };
}
