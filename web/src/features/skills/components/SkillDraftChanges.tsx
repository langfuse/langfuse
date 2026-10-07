import { useStore } from "zustand";
import { api } from "@/src/utils/api";
import { compareSkillFiles } from "@/src/features/skills/utils/compareSkillFiles";
import { type SkillEditorStore } from "./skillEditorStore";
import { SkillComparisonError } from "./SkillComparisonError";
import { SkillFileChanges } from "./SkillFileChanges";
import { SkillFileDiff } from "./SkillFileDiff";

export function SkillDraftChanges({
  projectId,
  store,
  isFirstVersion,
}: {
  projectId: string;
  store: SkillEditorStore;
  isFirstVersion: boolean;
}) {
  const name = useStore(store, (state) => state.name);
  const baseVersion = useStore(store, (state) => state.baseVersion);
  const draftFiles = useStore(store, (state) => state.files);
  const hasBaseVersion = !isFirstVersion && baseVersion !== null;
  const base = api.skills.byName.useQuery(
    { projectId, name, version: baseVersion ?? 1 },
    {
      enabled: hasBaseVersion,
      refetchOnWindowFocus: false,
      meta: { silentAllErrors: true },
    },
  );
  if (hasBaseVersion && base.isError) {
    return <SkillComparisonError retry={() => base.refetch()} />;
  }
  if (hasBaseVersion && !base.data) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading base version…
      </p>
    );
  }
  const changes = compareSkillFiles(
    hasBaseVersion ? base.data!.files : [],
    Object.values(draftFiles).map((file) => ({
      path: file.path,
      sha256Hash: file.currentSha,
    })),
  );
  return (
    <SkillFileChanges
      files={changes}
      emptyMessage="No file changes in this draft."
      renderDiff={(file) => {
        const draft = draftFiles[file.path];
        let newFile: { content: string } | { sha256Hash: string } | null = null;
        if (draft?.content !== undefined) newFile = { content: draft.content };
        else if (draft?.sourceSha) newFile = { sha256Hash: draft.sourceSha };
        return (
          <SkillFileDiff
            projectId={projectId}
            oldFile={
              file.oldFile?.sha256Hash
                ? { sha256Hash: file.oldFile.sha256Hash }
                : null
            }
            newFile={newFile}
            oldLabel={hasBaseVersion ? `Version ${baseVersion}` : "New skill"}
            newLabel="Draft"
          />
        );
      }}
    />
  );
}
