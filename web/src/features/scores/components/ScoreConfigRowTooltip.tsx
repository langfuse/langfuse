import { type ComponentProps } from "react";
import { Info } from "@langfuse/icons";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { ScoreConfigMenuDetails } from "@/src/features/scores/components/ScoreConfigMenuDetails";

// Score details stay on the add-score row.
// - Specific to score configs, not a general menu need.
// - If it becomes common, type the menu tooltip as: tooltip, title, rows of
//   string label and string value.
export function ScoreConfigRowTooltip({
  config,
}: {
  config: ComponentProps<typeof ScoreConfigMenuDetails>["config"];
}) {
  return (
    <>
      <Info size="sm" color="muted" aria-hidden="true" />
      <CustomTooltip
        content={<ScoreConfigMenuDetails config={config} />}
        overflow="scroll"
        placement="right"
      >
        {({ getTriggerProps }) => (
          <span
            {...getTriggerProps({
              "aria-hidden": true,
              className: "absolute inset-0 cursor-pointer",
            })}
          />
        )}
      </CustomTooltip>
    </>
  );
}
