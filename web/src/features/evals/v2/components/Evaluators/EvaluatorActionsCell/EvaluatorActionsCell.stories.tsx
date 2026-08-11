import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorActionsCell } from "./EvaluatorActionsCell";

const meta = preview.meta({ component: EvaluatorActionsCell });

export const WithScores = meta.story({
  args: {
    hasActiveRules: true,
    canViewExecutions: true,
    onViewScores: fn(),
    onViewExecutions: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
});

export const WithoutScores = meta.story({
  args: {
    hasActiveRules: false,
    canViewExecutions: true,
    onViewScores: fn(),
    onViewExecutions: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
});
