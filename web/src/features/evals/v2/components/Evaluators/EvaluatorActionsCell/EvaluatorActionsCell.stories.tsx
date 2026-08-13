import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorActionsCell } from "./EvaluatorActionsCell";

const meta = preview.meta({
  component: EvaluatorActionsCell,
  decorators: [
    (Story) => (
      <div className="w-[170px]">
        <Story />
      </div>
    ),
  ],
});

export const ActiveEvaluator = meta.story({
  args: {
    hasActiveRules: true,
    canViewExecutions: true,
    onViewScores: fn(),
    onViewExecutions: fn(),
    onManageRules: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
});

export const InactiveEvaluator = meta.story({
  args: {
    hasActiveRules: false,
    canViewExecutions: true,
    onViewScores: fn(),
    onViewExecutions: fn(),
    onManageRules: fn(),
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
    onManageRules: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Evaluator actions" }),
    );

    const body = within(canvasElement.ownerDocument.body);
    const menuElement = await body.findByRole("menu");
    await expect(menuElement).toHaveAttribute("data-state", "open");
    const menu = within(menuElement);
    await expect(
      menu.getByRole("menuitem", { name: "View executions" }),
    ).toBeInTheDocument();
    await expect(
      menu.getByRole("menuitem", { name: "Edit" }),
    ).toBeInTheDocument();
    await expect(
      menu.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  },
});
