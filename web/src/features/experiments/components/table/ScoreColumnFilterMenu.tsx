import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Check } from "@langfuse/icons";
import { type ScoreComparisonOperator } from "@/src/features/experiments/fns/scoreComparisonFilter";
import { type ComponentProps } from "react";

export type ScoreComparisonTarget = {
  experimentId: string;
  experimentName: string;
};

const OPERATOR_LABELS: Record<ScoreComparisonOperator, string> = {
  lower: "Worse than",
  higher: "Better than",
  differs: "Different from",
};

const ORDERED_OPERATORS: ScoreComparisonOperator[] = [
  "lower",
  "higher",
  "differs",
];

/**
 * The score column's own way into the comparison filter: "show
 * only the items worse than <comparison> on this score", from the header of the
 * score in question, with the comparison to read against picked here rather than
 * assumed.
 */
export const ScoreColumnFilterMenu = ({
  targets,
  active,
  hasOrder,
  onSelect,
  onClear,
  children,
}: {
  /** The experiments this score can be read against, default first. */
  targets: ScoreComparisonTarget[];
  active?: {
    operator: ScoreComparisonOperator;
    comparisonExperimentId: string;
  };
  /** Categorical scores have no order, so only "different from" applies. */
  hasOrder: boolean;
  onSelect: (
    operator: ScoreComparisonOperator,
    comparisonExperimentId: string,
  ) => void;
  onClear: () => void;
  children: ComponentProps<typeof DropdownMenu>["children"];
}) => {
  const operators = hasOrder ? ORDERED_OPERATORS : (["differs"] as const);
  const isActive = (operator: ScoreComparisonOperator, experimentId: string) =>
    active?.operator === operator &&
    active?.comparisonExperimentId === experimentId;

  const targetItem = (
    operator: ScoreComparisonOperator,
    target: ScoreComparisonTarget,
  ): DropdownMenuItemDefinition => ({
    type: "item",
    id: `${operator}-${target.experimentId}`,
    title:
      targets.length === 1
        ? `${OPERATOR_LABELS[operator]} ${target.experimentName}`
        : target.experimentName,
    icon: isActive(operator, target.experimentId) ? Check : undefined,
    onClick: () => onSelect(operator, target.experimentId),
  });

  const items: DropdownMenuItemDefinition[] =
    targets.length === 1
      ? operators.map((operator) => targetItem(operator, targets[0]))
      : operators.map((operator) => ({
          type: "submenu",
          id: operator,
          title: `${OPERATOR_LABELS[operator]}…`,
          items: targets.map((target) => targetItem(operator, target)),
        }));

  return (
    <DropdownMenu
      placement="bottom-end"
      title="Show only items"
      description="Compares the items loaded on this page — page through to check the rest of the run."
      items={items}
      footerItems={
        active
          ? [
              {
                type: "item",
                id: "clear",
                title: "Remove this score's filter",
                onClick: onClear,
              },
            ]
          : undefined
      }
    >
      {children}
    </DropdownMenu>
  );
};
