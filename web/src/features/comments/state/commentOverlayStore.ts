import { createStore } from "zustand/vanilla";
import { type CommentObjectType } from "@langfuse/shared";
import { type SelectionData } from "../contexts/InlineCommentSelectionContext";

export type CommentTarget = {
  objectId: string;
  objectType: CommentObjectType;
  objectStartTime?: Date | null;
} & (
  | { type: "comments" }
  | { type: "inline-comment"; selection: SelectionData }
);

export type CommentOverlay = {
  id: number;
  target: CommentTarget;
  presentation: "composer" | "thread";
  isOpen: boolean;
};

export function createCommentOverlayStore() {
  let requestId = 0;
  let pendingRequestId: number | undefined;
  let draftRevision = 0;
  return createStore<{
    overlay: CommentOverlay | undefined;
    hasDraft: boolean;
    mentionsOpen: boolean;
    actions: {
      open: (input: {
        target: CommentTarget;
        canWrite: boolean;
        loadComments: () => Promise<readonly unknown[]>;
        confirmDiscard: () => boolean;
      }) => Promise<void>;
      close: (
        overlay: CommentOverlay,
        confirmDiscard?: () => boolean,
      ) => boolean;
      setDraft: (sessionId: number, hasDraft: boolean) => void;
      setMentionsOpen: (sessionId: number, open: boolean) => void;
      consumeSelection: (overlay: CommentOverlay) => void;
    };
  }>((set, get) => ({
    overlay: undefined,
    hasDraft: false,
    mentionsOpen: false,
    actions: {
      async open({ target, canWrite, loadComments, confirmDiscard }) {
        if (get().hasDraft && !confirmDiscard()) return;
        const id = ++requestId;
        pendingRequestId = id;
        const initialDraftRevision = draftRevision;
        let presentation: CommentOverlay["presentation"] = "thread";
        try {
          const comments = await loadComments();
          if (comments.length === 0 && canWrite) presentation = "composer";
        } catch {
          // The thread query owns the error and retry UI.
        }
        if (requestId !== id) return;
        pendingRequestId = undefined;
        if (get().hasDraft && draftRevision !== initialDraftRevision) return;
        set({
          overlay: { id, target, presentation, isOpen: true },
          hasDraft: false,
          mentionsOpen: false,
        });
      },
      close(overlay, confirmDiscard) {
        const current = get();
        if (
          current.overlay &&
          (current.overlay.id !== overlay.id || !current.overlay.isOpen)
        )
          return false;
        if (!confirmDiscard && pendingRequestId !== undefined) return false;
        if (
          confirmDiscard &&
          (current.mentionsOpen || (current.hasDraft && !confirmDiscard()))
        )
          return false;
        ++requestId;
        pendingRequestId = undefined;
        set({
          overlay: { ...(current.overlay ?? overlay), isOpen: false },
          hasDraft: false,
          mentionsOpen: false,
        });
        return true;
      },
      setDraft(sessionId, hasDraft) {
        const current = get();
        if (
          (current.overlay?.id ?? 0) !== sessionId ||
          current.overlay?.isOpen === false
        )
          return;
        draftRevision += 1;
        if (current.hasDraft !== hasDraft) set({ hasDraft });
      },
      setMentionsOpen(sessionId, mentionsOpen) {
        if (
          (get().overlay?.id ?? 0) === sessionId &&
          get().overlay?.isOpen !== false &&
          get().mentionsOpen !== mentionsOpen
        )
          set({ mentionsOpen });
      },
      consumeSelection(overlay) {
        const current = get().overlay ?? overlay;
        if (
          current.id !== overlay.id ||
          !current.isOpen ||
          current.target.type !== "inline-comment"
        )
          return;
        set({
          overlay: {
            ...current,
            target: { ...current.target, type: "comments" },
          },
        });
      },
    },
  }));
}

export type CommentOverlayStore = ReturnType<typeof createCommentOverlayStore>;
