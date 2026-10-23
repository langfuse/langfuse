import { EllipsisVertical, Settings } from "@langfuse/icons";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AnalyzeControl } from "./AnalyzeControl";
import { type useTopicModelSettings } from "./TopicModelSettings";

type ModelSettings = ReturnType<typeof useTopicModelSettings>;
type TopicsHeaderActionsProps = {
  automaticProcessing: Pick<
    ModelSettings["automaticProcessing"],
    "state" | "saving"
  >;
  configure: Pick<ModelSettings["configure"], "settings">;
  canWrite: boolean;
  regenerateAvailable: boolean;
  onRegenerate: () => void;
  onAutomaticProcessing: () => void;
  onConfigure: () => void;
  onHistory: () => void;
  /** Before setup only the overflow menu shows. */
  menuOnly?: boolean;
};

export function TopicsHeaderActions({
  automaticProcessing,
  configure,
  canWrite,
  regenerateAvailable,
  onRegenerate,
  onAutomaticProcessing,
  onConfigure,
  onHistory,
  menuOnly = false,
}: TopicsHeaderActionsProps) {
  return (
    <div className="ph-no-capture flex items-center justify-end gap-1">
      {!menuOnly && (
        <AnalyzeControl
          state={automaticProcessing.state}
          canWrite={canWrite && !automaticProcessing.saving}
          onClick={onAutomaticProcessing}
        />
      )}
      <DropdownMenu
        ariaLabel="Topics actions"
        placement="bottom-end"
        items={[
          {
            id: "regenerate",
            type: "item",
            title: "Regenerate topics",
            ...(regenerateAvailable
              ? {}
              : { disabled: { reason: "Configure Topics first." } }),
            onClick: onRegenerate,
          },
          { id: "separator", type: "separator" },
          {
            id: "history",
            type: "item",
            title: "History",
            onClick: onHistory,
          },
          {
            id: "configure",
            type: "item",
            title: "Settings",
            icon: Settings,
            ...(configure.settings
              ? {}
              : { disabled: { reason: "Topics settings are still loading." } }),
            onClick: onConfigure,
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
