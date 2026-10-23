import { EllipsisVertical, Settings } from "@langfuse/icons";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AnalyzeMenu } from "./AnalyzeMenu";
import { type useTopicModelSettings } from "./TopicModelSettings";

export function TopicsHeaderActions({
  automaticProcessing,
  configure,
  canWrite,
  manualAvailable,
  openManual,
  onAutomaticProcessing,
  onConfigure,
  onHistory,
  onRefresh,
  menuOnly = false,
}: TopicsHeaderActionsProps) {
  return (
    <div className="ph-no-capture flex items-center justify-end gap-1">
      {!menuOnly && (
        <AnalyzeMenu
          state={automaticProcessing.state}
          canWrite={canWrite && !automaticProcessing.saving}
          manualAvailable={manualAvailable}
          onAutomatic={onAutomaticProcessing}
          onManual={openManual}
        />
      )}
      <DropdownMenu
        ariaLabel="Topics actions"
        placement="bottom-end"
        items={[
          {
            id: "configure",
            type: "item",
            title: "Configure Topics",
            icon: Settings,
            ...(configure.settings
              ? {}
              : { disabled: { reason: "Topics settings are still loading." } }),
            onClick: onConfigure,
          },
          {
            id: "history",
            type: "item",
            title: "History",
            onClick: onHistory,
          },
          {
            id: "refresh",
            type: "item",
            title: "Refresh results",
            onClick: onRefresh,
          },
        ]}
      >
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={EllipsisVertical}
            label="Topics actions"
            size="sm"
          />
        )}
      </DropdownMenu>
    </div>
  );
}

type ModelSettings = ReturnType<typeof useTopicModelSettings>;
type TopicsHeaderActionsProps = {
  automaticProcessing: Pick<
    ModelSettings["automaticProcessing"],
    "state" | "saving"
  >;
  configure: Pick<ModelSettings["configure"], "settings" | "triggerVariant">;
  canWrite: boolean;
  manualAvailable: boolean;
  openManual: () => void;
  onAutomaticProcessing: () => void;
  onConfigure: () => void;
  onHistory: () => void;
  onRefresh: () => void;
  /** Before setup only the overflow menu shows. */
  menuOnly?: boolean;
};
