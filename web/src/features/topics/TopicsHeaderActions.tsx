import { MoreHorizontal, Settings } from "lucide-react";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AutomaticProcessingControl } from "./AutomaticProcessingControl";
import { type useTopicModelSettings } from "./TopicModelSettings";

export function TopicsHeaderActions({
  automaticProcessing,
  configure,
  configured,
  canWrite,
  manualAvailable,
  openManual,
  onAutomaticProcessing,
  onConfigure,
  onHistory,
  onRefresh,
}: TopicsHeaderActionsProps) {
  return (
    <div className="ph-no-capture flex items-center justify-end gap-1">
      <AutomaticProcessingControl
        state={automaticProcessing.state}
        canWrite={canWrite && !automaticProcessing.saving}
        onOpen={onAutomaticProcessing}
      />
      {!configured ? (
        <Button
          text="Configure Topics"
          variant={configure.triggerVariant}
          size="sm"
          disabled={!configure.settings}
          onClick={onConfigure}
        />
      ) : null}
      {manualAvailable ? (
        <Button
          text="Manual processing"
          variant="secondary"
          size="sm"
          onClick={openManual}
        />
      ) : null}
      <DropdownMenu
        ariaLabel="Topics actions"
        placement="bottom-end"
        items={[
          ...(configured
            ? [
                {
                  id: "configure",
                  type: "item" as const,
                  title: "Configure Topics",
                  icon: Settings,
                  onClick: onConfigure,
                },
              ]
            : []),
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
            icon={MoreHorizontal}
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
  configured: boolean;
  canWrite: boolean;
  manualAvailable: boolean;
  openManual: () => void;
  onAutomaticProcessing: () => void;
  onConfigure: () => void;
  onHistory: () => void;
  onRefresh: () => void;
};
