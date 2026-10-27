import { useState } from "react";
import { useStore } from "zustand";
import { api } from "@/src/utils/api";
import { compareSkillFiles } from "@/src/features/skills/utils/compareSkillFiles";
import { type SkillDraftFile, type SkillEditorStore } from "./skillEditorStore";
import { SkillComparisonError } from "./SkillComparisonError";
import { SkillFileChanges } from "./SkillFileChanges";
import { SkillFileDiff } from "./SkillFileDiff";

export function SkillDraftChanges({
  projectId,
  store,
  isFirstVersion,
  comparisonVersion,
}: {
  projectId: string;
  store: SkillEditorStore;
  isFirstVersion: boolean;
  comparisonVersion?: number;
}) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const name = useStore(store, (state) => state.name);
  const baseVersion = useStore(store, (state) => state.baseVersion);
  const draftFiles = useStore(store, (state) => state.files);
  const version = comparisonVersion ?? baseVersion;
  const hasBaseVersion = !isFirstVersion && version !== null;
  const base = api.skills.byName.useQuery(
    { projectId, name, version: version ?? 1 },
    {
      enabled: hasBaseVersion,
      refetchOnWindowFocus: false,
      meta: { silentAllErrors: true },
    },
  );
  function retryBase() {
    base.refetch();
  }
  if (hasBaseVersion && base.isError) {
    return <SkillComparisonError retry={retryBase} />;
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
  const selectedFile =
    changes.find((file) => file.path === selectedPath) ?? changes[0];
  const draft = selectedFile ? draftFiles[selectedFile.path] : undefined;
  const newFile = getDraftFileContent(draft);

  return (
    <SkillFileChanges
      files={changes}
      emptyMessage="No file changes in this draft."
      selectedFile={selectedFile}
      onSelectFile={setSelectedPath}
    >
      {selectedFile ? (
        <SkillFileDiff
          projectId={projectId}
          oldFile={
            selectedFile.oldFile?.sha256Hash
              ? { sha256Hash: selectedFile.oldFile.sha256Hash }
              : null
          }
          newFile={newFile}
          oldLabel={hasBaseVersion ? `Version ${version}` : "New skill"}
          newLabel="Draft"
        />
      ) : null}
    </SkillFileChanges>
  );
}

function getDraftFileContent(draft: SkillDraftFile | undefined) {
  if (draft?.content !== undefined) return { content: draft.content };
  if (draft?.sourceSha) return { sha256Hash: draft.sourceSha };
  return null;
}
