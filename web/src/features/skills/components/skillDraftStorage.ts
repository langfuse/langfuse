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

// The in-memory draft that changed last, per key. Only a changed draft can
// hold unsaved edits, and a copy React created but never rendered never
// changes, so it is never picked.
const changedDrafts = new Map<
  string,
  { flush: () => void; release: () => void }
>();

/** Writes the latest in-memory edits for `key` to storage now. */
export function flushSkillDraft(key: string) {
  changedDrafts.get(key)?.flush();
}

/**
 * Writes the latest in-memory edits for `key` and stops that draft from
 * saving, so a draft written outside the editor is not overwritten. Follow it
 * with `reloadSkillDraft` so an open editor resumes the stored draft.
 */
export function releaseSkillDraft(key: string) {
  changedDrafts.get(key)?.release();
  changedDrafts.delete(key);
}

// Bumped when a draft is written outside the editor, so an open editor
// remounts and resumes it.
const reloadCounts = new Map<string, number>();
const reloadListeners = new Set<() => void>();

export function subscribeSkillDraftReloads(listener: () => void) {
  reloadListeners.add(listener);
  return () => {
    reloadListeners.delete(listener);
  };
}

export function getSkillDraftReloadCount(key: string) {
  return reloadCounts.get(key) ?? 0;
}

export function reloadSkillDraft(key: string) {
  reloadCounts.set(key, getSkillDraftReloadCount(key) + 1);
  reloadListeners.forEach((listener) => listener());
}

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
  return persistSkillDraft(
    key,
    stored.baseVersionId,
    createStoreForStoredSkillDraft({ ...stored, ...metadata }),
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
    clearTimeout(timeout);
    timeout = undefined;
    if (store.getState().dirty) writeSkillDraft(key, store, baseVersionId);
  };
  const changed = { flush: save, release: () => {} };
  const unsubscribe = store.subscribe(() => {
    changedDrafts.set(key, changed);
    clearTimeout(timeout);
    timeout = setTimeout(save, SAVE_DEBOUNCE_MS);
  });
  changed.release = () => {
    save();
    unsubscribe();
  };
  return {
    store,
    baseVersionId,
    discard: () => {
      unsubscribe();
      clearTimeout(timeout);
      clearSkillDraft(key);
      if (changedDrafts.get(key) === changed) changedDrafts.delete(key);
    },
  };
}

/** Writes the store's draft to storage right away. */
export function writeSkillDraft(
  key: string,
  store: SkillEditorStore,
  baseVersionId: string | null,
) {
  const state = store.getState();
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
}

/** An editor store for a stored draft that does not write itself back. */
export function createStoreForStoredSkillDraft(
  stored: StoredSkillDraft,
): SkillEditorStore {
  const {
    deletedFiles,
    folders,
    activePath,
    commitMessage,
    baseVersionId: _,
    ...initialValue
  } = stored;
  return createSkillEditorStore(initialValue, {
    deletedFiles,
    folders,
    activePath,
    commitMessage,
  });
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
