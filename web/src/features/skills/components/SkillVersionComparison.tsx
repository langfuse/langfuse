import { type ReactNode, useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { compareSkillFiles } from "@/src/features/skills/utils/compareSkillFiles";
import { SkillFileChanges } from "./SkillFileChanges";
import { SkillFileDiff } from "./SkillFileDiff";
import { SkillComparisonError } from "./SkillComparisonError";
import { api } from "@/src/utils/api";

type ComparisonProps = {
  projectId: string;
  name: string;
  selectedVersion: number;
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
    openComparison: (version: number) => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();

  return (
    <DialogController<{ before: number; after: number }>
      renderDialog={({ state }) => (
        <SkillVersionComparison {...props} initialVersions={state} />
      )}
    >
      {({ openDialog }) =>
        children({
          openComparison: (version) => {
            if (version === props.selectedVersion) return;
            const before = version;
            const after = props.selectedVersion;
            capture("skills:version_compare", {
              beforeVersion: before,
              afterVersion: after,
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
}: ComparisonProps & { initialVersions: { before: number; after: number } }) {
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

  return (
    <Dialog title="Compare skill versions" size="xxl">
      <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="text-muted-foreground text-sm">
          Compare saved file contents. Unsaved draft changes are not included.
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-bold">From</span>
            <SelectInput
              aria-label="From version"
              value={String(before)}
              options={options}
              placeholder="Select version"
              onValueChange={(value) => setBefore(Number(value))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-bold">To</span>
            <SelectInput
              aria-label="To version"
              value={String(after)}
              options={options}
              placeholder="Select version"
              onValueChange={(value) => setAfter(Number(value))}
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
        {before === after ? (
          <p role="status" className="text-muted-foreground text-sm">
            Select two different versions to compare.
          </p>
        ) : (
          <SkillVersionFiles
            key={`${before}:${after}`}
            projectId={props.projectId}
            name={props.name}
            before={before}
            after={after}
          />
        )}
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
  const oldVersion = api.skills.byName.useQuery(
    { projectId, name, version: before },
    { refetchOnWindowFocus: false, meta: { silentAllErrors: true } },
  );
  const newVersion = api.skills.byName.useQuery(
    { projectId, name, version: after },
    { refetchOnWindowFocus: false, meta: { silentAllErrors: true } },
  );

  if (oldVersion.isError || newVersion.isError) {
    return (
      <SkillComparisonError
        retry={() => {
          oldVersion.refetch();
          newVersion.refetch();
        }}
      />
    );
  }
  if (!oldVersion.data || !newVersion.data) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading versions…
      </p>
    );
  }
  const files = compareSkillFiles(oldVersion.data.files, newVersion.data.files);
  return (
    <SkillFileChanges
      files={files}
      emptyMessage="No file changes between these versions."
      renderDiff={(file) => (
        <SkillFileDiff
          projectId={projectId}
          oldFile={
            file.oldFile?.sha256Hash
              ? { sha256Hash: file.oldFile.sha256Hash }
              : null
          }
          newFile={
            file.newFile?.sha256Hash
              ? { sha256Hash: file.newFile.sha256Hash }
              : null
          }
          oldLabel={`Version ${before}`}
          newLabel={`Version ${after}`}
        />
      )}
    />
  );
}
