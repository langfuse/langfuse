import { Settings2 } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";

export type RunScoreDisplay = "collapsed" | "compact" | "regular";

const DISPLAY_OPTIONS: { id: RunScoreDisplay; title: string }[] = [
  { id: "collapsed", title: "Collapsed" },
  { id: "compact", title: "Compact" },
  { id: "regular", title: "Regular" },
];

/** Display menu for the run-level score summary only. */
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
      placement="bottom-end"
      items={DISPLAY_OPTIONS.map(({ id, title }) => ({
        id,
        title,
        type: "checkbox",
        checked: display === id,
        closeOnCheckedChange: true,
        onCheckedChange: () => onDisplayChange(id),
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
