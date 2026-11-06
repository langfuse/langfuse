import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { FACETS, INTERPRETATIONS } from "../lib/fixtures";
import { mockInterpretPrompt } from "../lib/mockBackend";
import { type AskAiInterpretation, type AskAiSemanticStatus } from "../types";
import { SemanticAskAiPrompt } from "./SemanticAskAiPrompt";

function InteractivePrompt(args: ComponentProps<typeof SemanticAskAiPrompt>) {
  const [prompt, setPrompt] = useState(args.prompt);
  const [status, setStatus] = useState(args.status);
  const [facetId, setFacetId] = useState(FACETS[0].id);
  const edit = (
    change: (current: AskAiInterpretation) => AskAiInterpretation,
  ) =>
    setStatus((current) =>
      current.kind === "preview"
        ? { kind: "preview", interpretation: change(current.interpretation) }
        : current,
    );
  return (
    <SemanticAskAiPrompt
      {...args}
      prompt={prompt}
      status={status}
      onPromptChange={(next) => {
        setPrompt(next);
        args.onPromptChange(next);
      }}
      onSubmit={(next) => {
        setStatus({
          kind: "preview",
          interpretation: mockInterpretPrompt(next, facetId),
        });
        args.onSubmit(next);
      }}
      onFacetChange={(next) => {
        setFacetId(next);
        edit((current) => ({
          ...current,
          semantic: current.semantic && { ...current.semantic, facetId: next },
        }));
        args.onFacetChange(next);
      }}
      onRemoveFilter={(index) => {
        edit((current) => ({
          ...current,
          filters: current.filters.filter((_, i) => i !== index),
        }));
        args.onRemoveFilter(index);
      }}
      onRemoveSemantic={() => {
        edit((current) => ({ ...current, semantic: null }));
        args.onRemoveSemantic();
      }}
    />
  );
}

/**
 * Ask AI in the tracing search bar, extended with search by meaning: the
 * prompt splits into exact filters and a `similar:` clause over Topics
 * summaries, previewed before it is applied.
 */
const meta = preview.meta({
  component: SemanticAskAiPrompt,
  args: {
    prompt: "",
    refineContext: "",
    status: { kind: "idle" } satisfies AskAiSemanticStatus,
    facets: FACETS,
    onPromptChange: fn(),
    onSubmit: fn(),
    onExit: fn(),
    onFacetChange: fn(),
    onRemoveFilter: fn(),
    onRemoveSemantic: fn(),
    onApply: fn(),
  },
});

const REFUND_PROMPT =
  "production errors from today where users want a refund to an expired card";

export const Default = meta.story({});

export const Generating = meta.story({
  args: {
    prompt: REFUND_PROMPT,
    status: { kind: "generating" } satisfies AskAiSemanticStatus,
  },
});

export const FiltersAndMeaning = meta.story({
  args: {
    prompt: REFUND_PROMPT,
    status: {
      kind: "preview",
      interpretation: INTERPRETATIONS.filtersAndMeaning,
    } satisfies AskAiSemanticStatus,
  },
});

/** Nothing in the prompt maps to a column, so it is all meaning. */
export const MeaningOnly = meta.story({
  args: {
    prompt: "customers angry about a late delivery",
    status: {
      kind: "preview",
      interpretation: INTERPRETATIONS.meaningOnly,
    } satisfies AskAiSemanticStatus,
  },
});

export const Refining = meta.story({
  args: {
    refineContext: "env:production level:ERROR timestamp:>now-24h",
    prompt: "only the ones about refunds to expired cards",
    status: {
      kind: "preview",
      interpretation: INTERPRETATIONS.filtersAndMeaning,
    } satisfies AskAiSemanticStatus,
  },
});

export const LowCoverage = meta.story({
  args: {
    prompt: "production traces about refund to expired card",
    status: {
      kind: "preview",
      interpretation: INTERPRETATIONS.lowCoverage,
    } satisfies AskAiSemanticStatus,
  },
});

/** The project has no Topics run, so the meaning part is dropped and said so. */
export const TopicsNotSetUp = meta.story({
  args: {
    prompt: REFUND_PROMPT,
    status: {
      kind: "preview",
      interpretation: INTERPRETATIONS.topicsNotSetUp,
    } satisfies AskAiSemanticStatus,
  },
});

export const Error = meta.story({
  args: {
    prompt: REFUND_PROMPT,
    status: {
      kind: "error",
      message: "Couldn't reach the AI service. Please try again.",
    } satisfies AskAiSemanticStatus,
  },
});

/** Try "production errors about refund to expired card", then edit the preview. */
export const Interactive = meta.story({
  render: (args) => <InteractivePrompt {...args} />,
});

export const SplitAndApply = meta.story({
  name: "(Test) Prompt Splits Into Filters and Meaning",
  render: (args) => <InteractivePrompt {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Ask AI to build filters" }),
      "production errors about refund to expired card{Enter}",
    );
    await expect(canvas.getByText("env:production")).toBeVisible();
    await expect(canvas.getByText("level:ERROR")).toBeVisible();
    await expect(
      canvas.getByText('similar:"refund to expired card"'),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Sentiment" }));
    await expect(args.onFacetChange).toHaveBeenLastCalledWith("sentiment");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove level:ERROR" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Apply" }));
    await expect(args.onApply).toHaveBeenLastCalledWith({
      filters: ["env:production"],
      semantic: expect.objectContaining({
        text: "refund to expired card",
        facetId: "sentiment",
      }),
      semanticUnavailable: false,
      estimatedMatches: 214,
    });
  },
});
