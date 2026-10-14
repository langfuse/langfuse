import { expect, fn, userEvent } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import preview from "../../../../../../../../.storybook/preview";
import { EVALUATOR_EMPTY_STATE_DOCS_HREF } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import type { EvaluatorEmptyStateStartingPoint } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import { EvaluatorsEmptyStateView } from "./EvaluatorsEmptyStateView";

const startingPoints = [
  {
    action: "detect-topics",
    template: {
      source: "managed",
      key: "topic-classifier",
      name: "Classify input topic",
      categories: ["classifier"],
      icon: "tags",
      description: "Assigns the input to one of a predefined set of topics.",
      maintainer: "langfuse",
      previewScores: [{ name: "input_topic", value: "support" }],
      evaluator: {
        type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        promptMessages: [{ role: "user", content: "Classify {{input}}." }],
        variables: [{ name: "input", defaultMapping: { field: "input" } }],
        outputDefinition: {
          dataType: "CATEGORICAL",
          score: {
            description: "Topic.",
            categories: ["support", "other"],
            shouldAllowMultipleMatches: false,
          },
          reasoning: { description: "One sentence." },
        },
      },
    },
    title: "Detect Topics",
    description:
      "Classify the requests going through your system to better understand volumes of different categories.",
  },
  {
    action: "select-template",
    template: {
      source: "managed",
      key: "user-disagreement",
      name: "Detect User Disagreement",
      categories: ["conversation"],
      icon: "messages-square",
      description: "Detects whether the user is pushing back on the assistant.",
      maintainer: "langfuse",
      previewScores: [{ name: "user_disagreement", value: "False" }],
      evaluator: {
        type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
        promptMessages: [
          {
            role: "user",
            content: "Decide whether {{last_user_message}} is disagreement.",
          },
        ],
        variables: [
          { name: "last_user_message", defaultMapping: { field: "input" } },
        ],
        outputDefinition: {
          dataType: "BOOLEAN",
          score: { description: "True if disagreement is present." },
          reasoning: { description: "One sentence." },
        },
      },
    },
  },
] satisfies EvaluatorEmptyStateStartingPoint[];

const meta = preview.meta({ component: EvaluatorsEmptyStateView });

export const Default = meta.story({
  args: {
    startingPoints,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
    onSelectTemplate: fn(),
    onBrowseLibrary: fn(),
  },
});

export const SetsUpDetectTopicsFromTheTemplate = meta.story({
  name: "(Test) Sets up Detect Topics from the managed template",
  args: {
    startingPoints,
    docsHref: EVALUATOR_EMPTY_STATE_DOCS_HREF,
    onSelectTemplate: fn(),
    onBrowseLibrary: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Set up Detect Topics" }),
    );
    await expect(args.onSelectTemplate).toHaveBeenCalledWith(
      startingPoints[0]?.template,
    );
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
      canvas.getByRole("button", { name: /Detect User Disagreement/ }),
    );
    await expect(args.onSelectTemplate).toHaveBeenCalledWith(
      startingPoints[1]?.template,
    );
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
