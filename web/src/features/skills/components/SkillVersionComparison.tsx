import { type ReactNode, useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { compareSkillFiles } from "@/src/features/skills/utils/compareSkillFiles";
import { SkillDraftChanges } from "./SkillDraftChanges";
import { type SkillEditorStore } from "./skillEditorStore";
import { SkillFileChanges } from "./SkillFileChanges";
import { SkillFileDiff } from "./SkillFileDiff";
import { SkillComparisonError } from "./SkillComparisonError";
import { api } from "@/src/utils/api";

type ComparisonProps = {
  projectId: string;
  name: string;
  selectedVersion: number;
  draftStore: SkillEditorStore | null;
  versions: { version: number }[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: boolean;
  onLoadMore: () => void;
};

export function SkillVersionComparisonController({
  children,
  ...props
}: ComparisonProps & {
  children: (control: {
    openComparison: (version: number, compareDraft?: boolean) => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();

  return (
    <DialogController<{ before: number; after: number | "draft" }>
      renderDialog={({ state }) => (
        <SkillVersionComparison {...props} initialVersions={state} />
      )}
    >
      {({ openDialog }) =>
        children({
          openComparison: (version, compareDraft = false) => {
            if (!compareDraft && version === props.selectedVersion) return;
            const before = version;
            const after =
              compareDraft && props.draftStore
                ? "draft"
                : props.selectedVersion;
            capture("skills:version_compare", {
              beforeVersion: before,
              afterVersion:
                after === "draft"
                  ? props.draftStore?.getState().baseVersion
                  : after,
              isDraftComparison: after === "draft",
            });
            openDialog({ before, after });
          },
        })
      }
    </DialogController>
  );
}

function SkillVersionComparison({
  initialVersions,
  ...props
}: ComparisonProps & {
  initialVersions: { before: number; after: number | "draft" };
}) {
  const [before, setBefore] = useState(initialVersions.before);
  const [after, setAfter] = useState(initialVersions.after);
  const options = [
    ...new Set([
      props.selectedVersion,
      ...props.versions.map(({ version }) => version),
    ]),
  ]
    .sort((a, b) => b - a)
    .map((version) => ({
      value: String(version),
      label: `Version ${version}`,
    }));

  function handleBeforeChange(value: string) {
    setBefore(Number(value));
  }
  function handleAfterChange(value: string) {
    setAfter(value === "draft" ? "draft" : Number(value));
  }

  function renderComparison() {
    if (after === "draft") {
      return props.draftStore ? (
        <SkillDraftChanges
          key={`draft:${before}`}
          projectId={props.projectId}
          store={props.draftStore}
          isFirstVersion={false}
          comparisonVersion={before}
        />
      ) : null;
    }
    if (before === after) {
      return (
        <p role="status" className="text-muted-foreground text-sm">
          Select two different versions to compare.
        </p>
      );
    }
    return (
      <SkillVersionFiles
        key={`${before}:${after}`}
        projectId={props.projectId}
        name={props.name}
        before={before}
        after={after}
      />
    );
  }

  return (
    <Dialog title="Compare skill versions" size="xxl">
      <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="text-muted-foreground text-sm">
          Compare saved versions or your unsaved local draft.
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-bold">From</span>
            <SelectInput
              aria-label="From version"
              value={String(before)}
              options={options}
              placeholder="Select version"
              onValueChange={handleBeforeChange}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-bold">To</span>
            <SelectInput
              aria-label="To version"
              value={String(after)}
              options={
                props.draftStore
                  ? [{ value: "draft", label: "Local draft" }, ...options]
                  : options
              }
              placeholder="Select version"
              onValueChange={handleAfterChange}
            />
          </div>
        </div>
        {props.hasMore ? (
          <div className="flex flex-col items-start gap-2">
            {props.loadMoreError ? (
              <p role="alert">
                Could not load older versions. Please try again.
              </p>
            ) : null}
            <Button
              text="Load older versions"
              variant="secondary"
              size="sm"
              loading={props.isLoadingMore}
              onClick={props.onLoadMore}
            />
          </div>
        ) : null}
        {renderComparison()}
      </div>
    </Dialog>
  );
}

function SkillVersionFiles({
  projectId,
  name,
  before,
  after,
}: {
  projectId: string;
  name: string;
  before: number;
  after: number;
}) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const oldVersion = api.skills.byName.useQuery(
    { projectId, name, version: before },
    { refetchOnWindowFocus: false, meta: { silentAllErrors: true } },
  );
  const newVersion = api.skills.byName.useQuery(
    { projectId, name, version: after },
    { refetchOnWindowFocus: false, meta: { silentAllErrors: true } },
  );

  function retryVersions() {
    oldVersion.refetch();
    newVersion.refetch();
  }
  if (oldVersion.isError || newVersion.isError) {
    return <SkillComparisonError retry={retryVersions} />;
  }
  if (!oldVersion.data || !newVersion.data) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading versions…
      </p>
    );
  }
  const files = compareSkillFiles(oldVersion.data.files, newVersion.data.files);
  const selectedFile =
    files.find((file) => file.path === selectedPath) ?? files[0];
  return (
    <SkillFileChanges
      files={files}
      emptyMessage="No file changes between these versions."
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
          newFile={
            selectedFile.newFile?.sha256Hash
              ? { sha256Hash: selectedFile.newFile.sha256Hash }
              : null
          }
          oldLabel={`Version ${before}`}
          newLabel={`Version ${after}`}
        />
      ) : null}
    </SkillFileChanges>
  );
}
