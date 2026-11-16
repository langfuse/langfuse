import { useState } from "react";
import {
  clearSkillDraft,
  readSkillDraft,
  resumeSkillDraft,
  type SkillDraft,
} from "@/src/features/skills/components/skillDraftStorage";
import { api } from "@/src/utils/api";

type StoredSkillDraftState =
  | { status: "loading" }
  | {
      status: "error";
      isRetrying: boolean;
      retry: () => void;
      discard: () => void;
    }
  | { status: "ready"; createInitialDraft: () => SkillDraft | null };

/**
 * Loads the stored draft of an existing skill together with its base version.
 * The draft resumes with that version's current labels and tags. A draft whose
 * base version no longer exists, or was recreated under the same number, is
 * dropped. Other load errors keep the stored draft until it is retried or
 * discarded, so a new draft cannot overwrite it.
 */
export function useStoredSkillDraft({
  projectId,
  skillName,
  draftKey,
}: {
  projectId: string;
  skillName: string;
  draftKey: string;
}): StoredSkillDraftState {
  const [storedDraft, setStoredDraft] = useState(() =>
    projectId && skillName ? readSkillDraft(draftKey) : null,
  );
  const baseVersion = storedDraft?.baseVersion ?? null;
  const base = api.skills.byName.useQuery(
    { projectId, name: skillName, version: baseVersion ?? 0 },
    { enabled: baseVersion !== null, refetchOnWindowFocus: false },
  );

  if (baseVersion !== null && base.isPending) return { status: "loading" };
  if (
    baseVersion !== null &&
    base.isError &&
    base.error.data?.code !== "NOT_FOUND"
  ) {
    return {
      status: "error",
      isRetrying: base.isFetching,
      retry: () => base.refetch(),
      discard: () => {
        clearSkillDraft(draftKey);
        setStoredDraft(null);
      },
    };
  }
  return {
    status: "ready",
    createInitialDraft: () => {
      if (!storedDraft) return null;
      if (base.data && base.data.id === storedDraft.baseVersionId) {
        return resumeSkillDraft(draftKey, storedDraft, {
          labels: base.data.labels,
          tags: base.data.tags,
        });
      }
      clearSkillDraft(draftKey);
      return null;
    },
  };
}
