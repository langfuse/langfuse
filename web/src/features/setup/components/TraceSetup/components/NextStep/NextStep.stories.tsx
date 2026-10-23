import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { readingOf } from "../../firstTrace";
import type { FirstTrace, Scoring } from "../../types";
import {
  agentTurn,
  appTrace,
  errorTrace,
  unpricedTrace,
} from "../TracePreview/TracePreview.fixtures";
import { NextStep } from "./NextStep";

const meta = preview.meta({
  component: NextStep,
});

const LONG_SPAN_NAME =
  "summarize-customer-support-conversation-with-retrieved-context";

/** The app trace with its LLM call renamed to something long, as hand-written spans often are. */
const longSpanTrace: FirstTrace = {
  ...appTrace,
  id: "trace-long",
  roots: appTrace.roots.map((root) => ({
    ...root,
    children: root.children.map((child) =>
      child.type === "GENERATION" ? { ...child, name: LONG_SPAN_NAME } : child,
    ),
  })),
};

const scored = {
  status: "scored",
  score: {
    name: "Helpfulness",
    value: 0.92,
    reason:
      "It answers the refund question directly and names the 30-day window.",
  },
  evaluatorHref: "#evaluator",
} satisfies Scoring;

/** NextStep's props for a trace, its reading included, with nothing skipped and every callback an action. */
const argsFor = (
  trace: FirstTrace,
  scoring: Scoring = { status: "noModel" },
) => ({
  trace,
  reading: readingOf(trace),
  scoring,
  projectId: "project-1",
  isHaloOn: false,
  hasTeammates: false,
  skippedGates: [],
  shouldAnimate: false,
  onSkipGate: fn(),
  onResumeGate: fn(),
  onConnectModel: fn(),
  onPickJudge: fn(),
  onAskHalo: fn(),
});

export const ConnectAModel = meta.story({
  args: argsFor(appTrace),
});

export const PickAJudge = meta.story({
  args: argsFor(appTrace, { status: "pickJudge", provider: "OpenAI" }),
});

export const Judging = meta.story({
  args: argsFor(appTrace, { status: "judging", judge: "Helpfulness" }),
});

export const HaloOn = meta.story({
  args: { ...argsFor(appTrace), isHaloOn: true },
});

export const AllSkipped = meta.story({
  args: {
    ...argsFor(appTrace),
    skippedGates: ["keepsWorking", "shared"],
  },
});

export const HaloWithALongSpanName = meta.story({
  args: { ...argsFor(longSpanTrace), isHaloOn: true },
});

export const AgentTurnGetsAgentJudges = meta.story({
  name: "(Test) A coding agent's turn gets an agent's judges",
  args: argsFor(agentTurn, { status: "pickJudge", provider: "Anthropic" }),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", {
        name: "Did it do what you asked?",
      }),
    ).toBeVisible();
  },
});

export const FailedStepComesFirst = meta.story({
  name: "(Test) A failed step comes before scoring",
  args: argsFor(errorTrace),
  play: async ({ canvasElement }) => {
    const step = within(canvasElement);
    await expect(
      step.getByRole("link", { name: "Open the failed step" }),
    ).toHaveAttribute("href", "#trace-1?observation=t3-answer");
    await expect(
      step.queryByRole("button", { name: "Test and save" }),
    ).toBeNull();
  },
});

export const UnpricedModelTip = meta.story({
  name: "(Test) A model without a price is the next step",
  args: argsFor(unpricedTrace),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: /Add its price/ }),
    ).toBeVisible();
  },
});

export const SetUpWithoutTheTeam = meta.story({
  name: "(Test) Set up once scored, with the team still on offer",
  args: argsFor(appTrace, scored),
  play: async ({ canvasElement }) => {
    const step = within(canvasElement);
    await expect(
      step.getByRole("link", { name: "Go to your project" }),
    ).toHaveAttribute("href", "/project/project-1");
    await expect(
      step.getByRole("link", { name: "Invite your team" }),
    ).toBeVisible();
  },
});

export const ConnectsAModel = meta.story({
  name: "(Test) Connecting a model hands over the provider and key",
  args: argsFor(appTrace),
  play: async ({ args, canvasElement }) => {
    const step = within(canvasElement);
    await userEvent.click(step.getByRole("radio", { name: "Anthropic" }));
    await userEvent.type(
      step.getByLabelText("Anthropic API key"),
      "sk-ant-test",
    );
    await userEvent.click(step.getByRole("button", { name: "Test and save" }));
    await expect(args.onConnectModel).toHaveBeenCalledWith(
      "Anthropic",
      "sk-ant-test",
    );
  },
});

export const ArrowsMoveBetweenProviders = meta.story({
  name: "(Test) Arrow keys move between the providers in their row",
  args: argsFor(appTrace),
  play: async ({ canvasElement }) => {
    const step = within(canvasElement);
    step.getByRole("radio", { name: "OpenAI" }).focus();
    // Held, as a person presses it: Radix checks the radio focus lands on while an arrow key is down
    await userEvent.keyboard("{ArrowRight>}");
    await waitFor(() =>
      expect(step.getByRole("radio", { name: "Anthropic" })).toBeChecked(),
    );
    await userEvent.keyboard("{/ArrowRight}");
    await expect(step.getByLabelText("Anthropic API key")).toBeVisible();
  },
});

export const AsksHalo = meta.story({
  name: "(Test) With Halo on, Halo takes the asks instead of the form",
  args: { ...argsFor(appTrace), isHaloOn: true },
  play: async ({ args, canvasElement }) => {
    const step = within(canvasElement);
    await expect(step.queryByLabelText(/API key/)).toBeNull();
    await userEvent.click(
      step.getByRole("button", {
        name: "Why did openai.chat take 1.04s?",
      }),
    );
    await expect(args.onAskHalo).toHaveBeenCalledWith(
      "Why did openai.chat take 1.04s?",
    );
  },
});

export const SkipAsksToSkipTheGate = meta.story({
  name: "(Test) Not now asks to skip the open gate",
  args: argsFor(errorTrace),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Not now" }),
    );
    await expect(args.onSkipGate).toHaveBeenCalledWith("nothingBroken");
  },
});

export const LongSpanNameStaysInTheCard = meta.story({
  name: "(Test) A long span name is cut in the ask, and Halo gets it whole",
  args: { ...argsFor(longSpanTrace), isHaloOn: true },
  play: async ({ args, canvasElement }) => {
    const step = within(canvasElement);
    const whole = `Why did ${LONG_SPAN_NAME} take 1.04s?`;
    const ask = step.getByRole("button", { name: /^Why did summarize/ });
    await expect(ask).not.toHaveAccessibleName(whole);
    await expect(ask.closest("li")).toHaveAttribute("title", whole);
    await userEvent.click(ask);
    await expect(args.onAskHalo).toHaveBeenCalledWith(whole);
  },
});
