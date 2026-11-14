import { z } from "zod";
import {
  createSkillEditorStore,
  type SkillEditorInitialValue,
  type SkillEditorStore,
} from "./skillEditorStore";

/**
 * Keeps an unsaved skill draft in sessionStorage so it survives reloads in
 * the same tab. One draft per skill and project; `null` is the new-skill draft.
 * Only drafts with changes are written, and writes are debounced because the
 * editor updates the store on every keystroke.
 */

const SAVE_DEBOUNCE_MS = 300;

const SkillDraftFileSchema = z.object({
  path: z.string(),
  content: z.string().optional(),
  currentSha: z.string().nullable(),
  sourceSha: z.string().nullable(),
  sourceContentLength: z.number().nullable(),
});

const StoredSkillDraftSchema = z.object({
  schemaVersion: z.literal(2),
  name: z.string(),
  baseVersion: z.number().int().nullable(),
  /** Row id of the base version, so a recreated version with the same number is not mistaken for it. */
  baseVersionId: z.string().nullable(),
  files: z.array(SkillDraftFileSchema).min(1),
  deletedFiles: z.array(SkillDraftFileSchema),
  folders: z.array(z.string()),
  activePath: z.string(),
  labels: z.array(z.string()),
  tags: z.array(z.string()),
  commitMessage: z.string(),
});

export type StoredSkillDraft = z.infer<typeof StoredSkillDraftSchema>;

export type SkillDraft = {
  store: SkillEditorStore;
  baseVersionId: string | null;
  /** Stops saving and removes the stored draft. */
  discard: () => void;
};

export function skillDraftStorageKey(
  projectId: string,
  skillName: string | null,
) {
  return `langfuse:skill-draft:${projectId}:${skillName === null ? "new" : `skill:${skillName}`}`;
}

/** Restores the stored draft for `key`, or returns null when there is none. */
export function restoreSkillDraft(key: string): SkillDraft | null {
  const stored = readSkillDraft(key);
  return stored ? resumeSkillDraft(key, stored) : null;
}

/**
 * Resumes a stored draft. Pass `metadata` with the base version's current
 * labels and tags so the draft does not show values that changed since it
 * was stored.
 */
export function resumeSkillDraft(
  key: string,
  stored: StoredSkillDraft,
  metadata?: { labels: string[]; tags: string[] },
): SkillDraft {
  const {
    deletedFiles,
    folders,
    activePath,
    commitMessage,
    baseVersionId,
    ...initialValue
  } = stored;
  return persistSkillDraft(
    key,
    baseVersionId,
    createSkillEditorStore(
      { ...initialValue, ...metadata },
      {
        deletedFiles,
        folders,
        activePath,
        commitMessage,
      },
    ),
  );
}

export function createSkillDraft(
  key: string,
  initialValue: SkillEditorInitialValue,
  baseVersionId: string | null,
): SkillDraft {
  return persistSkillDraft(
    key,
    baseVersionId,
    createSkillEditorStore(initialValue),
  );
}

function persistSkillDraft(
  key: string,
  baseVersionId: string | null,
  store: SkillEditorStore,
): SkillDraft {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timeout = undefined;
    const state = store.getState();
    if (!state.dirty) return;
    const draft: StoredSkillDraft = {
      schemaVersion: 2,
      name: state.name,
      baseVersion: state.baseVersion,
      baseVersionId,
      files: Object.values(state.files),
      deletedFiles: Object.values(state.deletedFiles),
      folders: state.folders,
      activePath: state.activePath,
      labels: state.labels,
      tags: state.tags,
      commitMessage: state.commitMessage,
    };
    try {
      window.sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Storage can be full or unavailable; the draft stays in memory, and an
      // older stored copy must not be restored in its place.
      clearSkillDraft(key);
    }
  };
  const unsubscribe = store.subscribe(() => {
    clearTimeout(timeout);
    timeout = setTimeout(save, SAVE_DEBOUNCE_MS);
  });
  return {
    store,
    baseVersionId,
    discard: () => {
      unsubscribe();
      clearTimeout(timeout);
      clearSkillDraft(key);
    },
  };
}

/** Reads the stored draft for `key`; an invalid entry is removed. */
export function readSkillDraft(key: string): StoredSkillDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed = StoredSkillDraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Unreadable storage or malformed JSON is treated like a missing draft.
  }
  clearSkillDraft(key);
  return null;
}

export function clearSkillDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
