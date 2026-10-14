import { expect, fn, userEvent } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { EVALUATOR_EMPTY_STATE_DOCS_HREF } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { prepareEvaluatorEmptyState } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import { EvaluatorsEmptyStateView } from "./EvaluatorsEmptyStateView";

const { startingPoints } = prepareEvaluatorEmptyState();

const meta = preview.meta({ component: EvaluatorsEmptyStateView });

export const Default = meta.story({
  args: {
    startingPoints,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
    onSelectTemplate: fn(),
    onBrowseLibrary: fn(),
  },
});

export const SelectsAStartingPoint = meta.story({
  name: "(Test) Selects a starting-point template",
  args: {
    startingPoints,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
    onSelectTemplate: fn(),
    onBrowseLibrary: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Rate Customer Frustration/ }),
    );
    await expect(args.onSelectTemplate).toHaveBeenCalledWith(startingPoints[2]);
  },
});

export const OpensTheLibrary = meta.story({
  name: "(Test) Opens the template library",
  args: {
    startingPoints,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
    onSelectTemplate: fn(),
    onBrowseLibrary: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Browse all templates or start from scratch",
      }),
    );
    await expect(args.onBrowseLibrary).toHaveBeenCalledOnce();
  },
});

export const LinksToDocs = meta.story({
  name: "(Test) Links to the evaluators overview docs",
  args: {
    startingPoints,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
    onSelectTemplate: fn(),
    onBrowseLibrary: fn(),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "How evaluators work." }),
    ).toHaveAttribute("href", EVALUATOR_EMPTY_STATE_DOCS_HREF);
  },
});
