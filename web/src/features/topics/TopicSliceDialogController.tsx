import { type ReactNode } from "react";
import type { TopicFacet, TopicRule } from "@langfuse/shared/topics";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { NewMapDialog } from "./NewMapDialog";
import { SnapshotDialog } from "./SnapshotDialog";
import { TopicRefreshMapDialog } from "./TopicRefreshMapDialog";
import { TopicRuleDialog } from "./TopicRuleDialog";

export type TopicSliceDialog =
  | { kind: "map" }
  | { kind: "snapshot" }
  | { kind: "rule"; rule: TopicRule }
  | { kind: "refresh"; rule: TopicRule };

/**
 * Owns the New map, New snapshot, Edit map and Refresh map dialogs, which open
 * from the map picker, the actions menu and empty states.
 */
export function TopicSliceDialogController({
  projectId,
  facets,
  mapDisabledReason,
  onAnalysisStarted,
  onRuleCreated,
  children,
}: {
  projectId: string;
  facets: TopicFacet[];
  /** Why no further map can be created; absent when it can. */
  mapDisabledReason?: string;
  onAnalysisStarted: (executionId: string) => void;
  onRuleCreated: (ruleId: string) => void;
  children: (control: {
    openSliceDialog: (dialog: TopicSliceDialog) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<TopicSliceDialog>
      renderDialog={({ state, closeDialog }) => {
        if (state.kind === "map")
          return (
            <NewMapDialog
              projectId={projectId}
              facets={facets}
              disabledReason={mapDisabledReason}
              onCreated={onRuleCreated}
              closeDialog={closeDialog}
            />
          );
        if (state.kind === "snapshot")
          return (
            <SnapshotDialog
              projectId={projectId}
              facets={facets}
              onStarted={onAnalysisStarted}
              closeDialog={closeDialog}
            />
          );
        if (state.kind === "refresh")
          return (
            <TopicRefreshMapDialog
              projectId={projectId}
              rule={state.rule}
              closeDialog={closeDialog}
            />
          );
        return (
          <TopicRuleDialog
            projectId={projectId}
            facets={facets}
            rule={state.rule}
            closeDialog={closeDialog}
          />
        );
      }}
    >
      {({ openDialog }) => children({ openSliceDialog: openDialog })}
    </DialogController>
  );
}
