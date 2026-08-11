import { expect, fn, userEvent, within } from "storybook/test";

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

export const OpenMenu = meta.story({
  name: "(Test) Opens menu",
  args: {
    hasActiveRules: true,
    canViewExecutions: true,
    onViewScores: fn(),
    onViewExecutions: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Evaluator actions" }),
    );

    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("menuitem", { name: "View executions" }),
    ).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  },
});
