import { Check, Settings2 } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";

export type RunScoreDisplay = "collapsed" | "compact" | "regular";

const displayOptions: { id: RunScoreDisplay; title: string }[] = [
  { id: "collapsed", title: "Collapsed" },
  { id: "compact", title: "Compact" },
  { id: "regular", title: "Regular" },
];

export function ExperimentScoreDisplaySettings({
  display,
  onDisplayChange,
}: {
  display: RunScoreDisplay;
  onDisplayChange: (display: RunScoreDisplay) => void;
}) {
  return (
    <DropdownMenu
      title="Run-level scores"
      ariaLabel="Run-level score display"
      placement="bottom-end"
      items={displayOptions.map((option) => ({
        ...option,
        type: "item",
        icon: display === option.id ? Check : undefined,
        onClick: () => onDisplayChange(option.id),
      }))}
    >
      {({ getTriggerProps }) => (
        <Button
          text="Display"
          icon={Settings2}
          variant="outline"
          size="sm"
          {...getTriggerProps()}
        />
      )}
    </DropdownMenu>
  );
}
