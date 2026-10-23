import { useState, type ComponentProps } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  agentTurn,
  answeredTurn,
  appTrace,
  demoTrace,
  errorTrace,
  spansOnlyTrace,
} from "./components/TracePreview/TracePreview.fixtures";
import { TraceSetupView } from "./TraceSetupView";
import type {
  FirstTrace,
  ProjectKeys,
  Scoring,
  TraceSetupModel,
  TraceSetupState,
} from "./types";
import {
  initialModelOf,
  useTraceSetup,
  type TraceSetupEffects,
  type TraceSetupStart,
} from "./useTraceSetup";

const keys = {
  publicKey: "pk-lf-00000000-0000-0000-0000-000000000000",
  secretKey: "sk-lf-00000000-0000-0000-0000-000000001234",
};

const newProjectKeys = {
  publicKey: "pk-lf-11111111-1111-1111-1111-111111111111",
  secretKey: "sk-lf-11111111-1111-1111-1111-111111115678",
};

const ready: ProjectKeys = { status: "ready", keys };

const newerAppTrace: FirstTrace = {
  ...appTrace,
  id: "trace-2",
  href: "#trace-2",
  io: {
    input: "Can I switch from monthly to annual halfway through?",
    output:
      "Yes. The switch takes effect right away and the unused month is credited.",
  },
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

const nothingCopied = { env: false, setup: false };

const traceIn = (
  trace: FirstTrace,
  more: Partial<Extract<TraceSetupState, { step: "traceIn" }>> = {},
): TraceSetupState => ({
  step: "traceIn",
  trace,
  newer: null,
  isNewerShown: false,
  traceCount: 1,
  secondsSinceLatest: 2,
  scoring: { status: "noModel" },
  skippedGates: [],
  hasOpenedTrace: false,
  ...more,
});

const steps = {
  wayIn: { step: "wayIn" },
  demoAnswered: { step: "demo", turns: [answeredTurn] },
  app: {
    step: "setup",
    way: { kind: "app", integration: null },
    copied: nothingCopied,
  },
  integration: {
    step: "setup",
    way: { kind: "app", integration: "vercel-ai-sdk" },
    copied: nothingCopied,
  },
  agent: {
    step: "setup",
    way: { kind: "agent", slug: "claude-code" },
    copied: nothingCopied,
  },
} satisfies Record<string, TraceSetupState>;

/** The page as it opens on a step, nothing changed in front of you yet. */
const openedOn = (
  setup: TraceSetupState,
  projectKeys: ProjectKeys = ready,
): TraceSetupModel =>
  initialModelOf({ setup, keys: projectKeys, newProject: { status: "none" } });

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the page's server calls return, at once, so a test's next step finds them. */
const instantEffects: TraceSetupEffects = {
  createKeys: async () => keys,
  createProject: async (name) => ({
    status: "ready",
    name,
    href: "#new-project",
    keys: newProjectKeys,
  }),
  connectModel: async () => {},
  pickJudge: async (judge) => ({
    score: { ...scored.score, name: judge },
    evaluatorHref: scored.evaluatorHref,
  }),
  askDemo: async (question) => ({
    answer: answeredTurn.answer ?? "",
    trace: { ...demoTrace, io: { input: question, output: "" } },
  }),
  askHalo: () => {},
  onCopy: () => {},
};

/** The same calls taking about as long as the server would, for the walkthrough. */
const walkthroughEffects: TraceSetupEffects = {
  createKeys: () => wait(700).then(() => keys),
  createProject: (name) =>
    wait(900).then(() => instantEffects.createProject(name)),
  connectModel: () => wait(900),
  pickJudge: (judge) => wait(1200).then(() => instantEffects.pickJudge(judge)),
  askDemo: (question) => wait(900).then(() => instantEffects.askDemo(question)),
  askHalo: () => {},
  onCopy: () => {},
};

/** The view on its own state machine, as the page runs it: `args.model` is where it opens. */
function LiveView({
  model,
  project,
}: Pick<ComponentProps<typeof TraceSetupView>, "model" | "project">) {
  const setup = useTraceSetup({ start: model, effects: instantEffects });
  return (
    <TraceSetupView
      model={setup.model}
      project={project}
      actions={setup.actions}
    />
  );
}

/** The first traces the walkthrough can send, each a different path through the page. */
const SENDABLE_TRACES = [
  { label: "App trace", trace: appTrace },
  { label: "Claude Code turn", trace: agentTurn },
  { label: "Failed trace", trace: errorTrace },
  { label: "Spans only", trace: spansOnlyTrace },
] satisfies { label: string; trace: FirstTrace }[];

/** The page from where it opens, with what only the outside world does (send traces, come back) on buttons above it. */
function WalkthroughPage({
  start,
  project,
  onGoTo,
}: {
  start: TraceSetupStart;
  project: ComponentProps<typeof TraceSetupView>["project"];
  onGoTo: (start: TraceSetupStart) => void;
}) {
  const { model, actions, receive } = useTraceSetup({
    start,
    effects: walkthroughEffects,
  });
  const isTraceIn = model.setup.step === "traceIn";
  return (
    <>
      <div
        role="toolbar"
        aria-label="Walkthrough"
        className="flex flex-wrap items-center gap-1 border-b px-4 py-2.5"
      >
        <Button
          text="Start over"
          variant="ghost"
          size="sm"
          onClick={() => onGoTo(openedOn(steps.wayIn, { status: "none" }))}
        />
        {SENDABLE_TRACES.map(({ label, trace }) => (
          <Button
            key={label}
            text={label}
            variant="secondary"
            size="sm"
            onClick={() => receive.traceArrived(trace)}
          />
        ))}
        <Button
          text="Send a newer one"
          variant="secondary"
          size="sm"
          disabled={!isTraceIn}
          onClick={() => receive.traceArrived(newerAppTrace)}
        />
        <Button
          text="Back from the trace"
          variant="secondary"
          size="sm"
          disabled={!isTraceIn}
          onClick={receive.traceOpened}
        />
      </div>
      <TraceSetupView model={model} project={project} actions={actions} />
    </>
  );
}

const meta = preview.meta({
  component: TraceSetupView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    model: openedOn(steps.wayIn, { status: "none" }),
    project: {
      id: "project-1",
      baseUrl: "https://cloud.langfuse.com",
      isHaloOn: false,
      hasTeammates: false,
      canCreateProject: true,
    },
    actions: {
      pickWay: fn(),
      createKeys: fn(),
      copy: fn(),
      startDemo: fn(),
      sendDemoMessage: fn(),
      leaveDemo: fn(),
      showNewest: fn(),
      skipGate: fn(),
      resumeGate: fn(),
      connectModel: fn(),
      pickJudge: fn(),
      askHalo: fn(),
      createProject: fn(),
      openPanel: fn(),
      changePanel: fn(),
      closePanel: fn(),
    },
  },
});

export const PickAWay = meta.story({});

export const CreatingKeys = meta.story({
  args: { model: openedOn(steps.app, { status: "creating" }) },
});

export const WithoutKeyAccess = meta.story({
  args: { model: openedOn(steps.app, { status: "noAccess" }) },
});

export const SetUpYourApp = meta.story({
  args: { model: openedOn(steps.app) },
});

export const SetUpYourCodingAgent = meta.story({
  args: { model: openedOn(steps.agent) },
});

export const SetUpWithAnIntegration = meta.story({
  args: { model: openedOn(steps.integration) },
});

export const FirstTraceIn = meta.story({
  args: { model: openedOn(traceIn(appTrace)) },
});

export const SetUp = meta.story({
  args: { model: openedOn(traceIn(appTrace, { scoring: scored })) },
});

export const BackFromTheTrace = meta.story({
  args: { model: openedOn(traceIn(appTrace, { hasOpenedTrace: true })) },
});

export const AgentTurnIn = meta.story({
  args: { model: openedOn(traceIn(agentTurn)) },
});

export const ManyTraces = meta.story({
  args: {
    model: openedOn(
      traceIn(appTrace, {
        traceCount: 3,
        secondsSinceLatest: 8,
        newer: newerAppTrace,
      }),
    ),
  },
});

export const Walkthrough = meta.story({
  parameters: { controls: { disable: true } },
  render: function WalkthroughStory(args) {
    const [run, setRun] = useState<{
      count: number;
      start: TraceSetupStart;
    }>({ count: 0, start: args.model });
    const [isHaloOn, setIsHaloOn] = useState(false);
    const [hasTeammates, setHasTeammates] = useState(false);
    return (
      <>
        <div className="flex flex-wrap items-center gap-4 px-4 pt-2.5 text-xs">
          <label className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={isHaloOn}
              onCheckedChange={setIsHaloOn}
            />
            Halo on
          </label>
          <label className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={hasTeammates}
              onCheckedChange={setHasTeammates}
            />
            A teammate joined
          </label>
        </div>
        <WalkthroughPage
          key={run.count}
          start={run.start}
          project={{ ...args.project, isHaloOn, hasTeammates }}
          onGoTo={(start) =>
            setRun(({ count }) => ({ count: count + 1, start }))
          }
        />
      </>
    );
  },
});

export const ShowsTheSecret = meta.story({
  name: "(Test) Shows the secret only when asked",
  args: { model: openedOn(steps.app) },
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.queryByText(keys.secretKey)).toBeNull();
    await userEvent.click(view.getByRole("button", { name: "Show secret" }));
    await expect(view.getByText(keys.secretKey)).toBeVisible();
  },
});

export const CopiesThePrompt = meta.story({
  name: "(Test) Copies the prompt and checks its step",
  args: { model: openedOn(steps.app) },
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(view.getByRole("button", { name: "Copy prompt" }));
      await expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("Add Langfuse tracing to this application."),
      );
      await expect(args.actions.copy).toHaveBeenCalledWith("setup");
      await expect(view.getByRole("button", { name: "Copied" })).toBeVisible();
    } finally {
      writeText.mockRestore();
    }
  },
});

export const CopyingTheSecretChecksTheKeys = meta.story({
  name: "(Test) Copying the secret key checks the keys step, other rows don't",
  args: { model: openedOn(steps.app) },
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(
        view.getByRole("button", { name: "Copy LANGFUSE_PUBLIC_KEY" }),
      );
      await expect(args.actions.copy).not.toHaveBeenCalled();
      await userEvent.click(
        view.getByRole("button", { name: "Copy LANGFUSE_SECRET_KEY" }),
      );
      await expect(writeText).toHaveBeenCalledWith(keys.secretKey);
      await expect(args.actions.copy).toHaveBeenCalledWith("env");
    } finally {
      writeText.mockRestore();
    }
  },
});

/** Opens every integration from the app's setup, to pick its stack; the panel loads, then takes the card's place. */
async function openIntegrations(canvasElement: HTMLElement) {
  const view = within(canvasElement);
  await userEvent.click(view.getByRole("button", { name: "Pick your stack" }));
  return within(await view.findByRole("region", { name: "Integrations" }));
}

export const OpensIntegrations = meta.story({
  name: "(Test) Opens every integration in place",
  args: { model: openedOn(steps.app) },
  render: LiveView,
  play: async ({ canvasElement }) => {
    const panel = await openIntegrations(canvasElement);
    // The panel slides in over 240 ms
    await waitFor(() =>
      expect(
        panel.getByRole("button", { name: "OpenTelemetry" }),
      ).toBeVisible(),
    );
    await expect(
      within(canvasElement).queryByRole("button", { name: "Copy prompt" }),
    ).toBeNull();
  },
});

export const SuggestsANearMiss = meta.story({
  name: "(Test) Suggests a near miss for a typo",
  args: { model: openedOn(steps.app) },
  render: LiveView,
  play: async ({ canvasElement }) => {
    const panel = await openIntegrations(canvasElement);
    await userEvent.type(panel.getByRole("searchbox"), "langchian");
    await expect(
      panel.getByRole("region", { name: "Did you mean" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /^LangChain & LangGraph/ }),
    ).toBeVisible();
  },
});

export const PicksAnIntegrationIntoTheCard = meta.story({
  name: "(Test) Picking an integration closes the panel and sets up the card",
  args: { model: openedOn(steps.app) },
  render: LiveView,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    const panel = await openIntegrations(canvasElement);
    await userEvent.click(panel.getByRole("button", { name: "Python SDK" }));
    await expect(
      view.queryByRole("region", { name: "Integrations" }),
    ).toBeNull();
    // The card's parts rise back in over 260 ms
    await waitFor(() =>
      expect(view.getByRole("heading", { name: /^Python SDK/ })).toBeVisible(),
    );
    await waitFor(() =>
      expect(
        view.getByText(/^Your agent follows the Python SDK guide/),
      ).toBeVisible(),
    );
  },
});

export const BackKeepsYourPlace = meta.story({
  name: "(Test) Back returns to the card, focus where it was",
  args: { model: openedOn(steps.app) },
  render: LiveView,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    const panel = await openIntegrations(canvasElement);
    await userEvent.click(panel.getByRole("button", { name: "Back" }));
    await expect(
      view.getByRole("button", { name: "Pick your stack" }),
    ).toHaveFocus();
  },
});

export const TraceClosesThePicker = meta.story({
  name: "(Test) A trace arriving closes the picker and shows itself",
  parameters: { controls: { disable: true } },
  args: { model: openedOn(steps.app) },
  render: Walkthrough.input.render,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await openIntegrations(canvasElement);
    await userEvent.click(view.getByRole("button", { name: "App trace" }));
    await expect(
      view.queryByRole("region", { name: "Integrations" }),
    ).toBeNull();
    // The receipt rises in over 260 ms
    await waitFor(() =>
      expect(view.getByRole("link", { name: "Open the trace" })).toBeVisible(),
    );
  },
});

export const PicksTheApp = meta.story({
  name: "(Test) Picking the app opens its setup and makes the keys",
  render: LiveView,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole("button", { name: "Set up tracing" }));
    await expect(
      view.getByRole("heading", { name: "Add tracing to your app" }),
    ).toBeVisible();
    // The keys land a moment later and fade into their rows
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Copy .env" })).toBeVisible(),
    );
  },
});

export const PicksACodingAgent = meta.story({
  name: "(Test) Picking a coding agent is one click",
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Set up Claude Code" }),
    );
    await expect(args.actions.pickWay).toHaveBeenCalledWith({
      kind: "agent",
      slug: "claude-code",
    });
  },
});

export const MoreAgentsInPlace = meta.story({
  name: "(Test) More coding agents open in place and pick one",
  render: LiveView,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole("button", { name: /^\+\d+ more$/ }));
    const panel = within(
      await view.findByRole("region", { name: "Integrations" }),
    );
    await expect(
      panel.getByRole("button", { name: /^Developer tools/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(panel.getByRole("button", { name: "Cursor" }));
    await expect(
      view.getByRole("heading", { name: "Trace your Cursor sessions" }),
    ).toBeVisible();
  },
});

export const PromptBeforeKeys = meta.story({
  name: "(Test) The prompt copies while the keys are made",
  args: { model: openedOn(steps.app, { status: "creating" }) },
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await expect(
        view.queryByRole("button", { name: "Copy .env" }),
      ).toBeNull();
      await userEvent.click(view.getByRole("button", { name: "Copy prompt" }));
      await expect(args.actions.copy).toHaveBeenCalledWith("setup");
    } finally {
      writeText.mockRestore();
    }
  },
});

export const NoKeyAccessSaysWho = meta.story({
  name: "(Test) Without key access, it says who can make them",
  args: { model: openedOn(steps.app, { status: "noAccess" }) },
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByText(/Ask a project owner or admin/)).toBeVisible();
    await expect(
      view.queryByRole("button", { name: "Create API keys" }),
    ).toBeNull();
    await expect(
      view.getByRole("button", { name: "Copy prompt" }),
    ).toBeVisible();
  },
});

export const IntegrationNamesItsSetup = meta.story({
  name: "(Test) An integration's setup names it, links its guide and goes back to any stack",
  args: { model: openedOn(steps.integration) },
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    await expect(
      view.getByRole("heading", { name: /^Vercel AI SDK/ }),
    ).toBeVisible();
    await expect(
      view.getByRole("link", { name: /^Vercel AI SDK guide/ }),
    ).toBeVisible();
    await userEvent.click(view.getByRole("button", { name: "Use any stack" }));
    await expect(args.actions.pickWay).toHaveBeenCalledWith({
      kind: "app",
      integration: null,
    });
  },
});

export const AgentSetupCopiesItsInstall = meta.story({
  name: "(Test) A coding agent's setup copies its install command",
  args: { model: openedOn(steps.agent) },
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(view.getByRole("button", { name: "Copy command" }));
      await expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("claude plugin install"),
      );
      await expect(args.actions.copy).toHaveBeenCalledWith("setup");
    } finally {
      writeText.mockRestore();
    }
  },
});

export const SetupAsksOnlyForTheSetup = meta.story({
  name: "(Test) Before a trace, the page asks only for the setup",
  args: { model: openedOn(steps.app) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("link", { name: "Invite your team" }),
    ).toBeNull();
  },
});

export const NewTraceWaitsForShow = meta.story({
  name: "(Test) A newer trace waits until it's asked for",
  args: ManyTraces.input.args,
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByText("3 traces")).toBeVisible();
    await userEvent.click(
      view.getByRole("button", { name: "New trace · show" }),
    );
    await expect(args.actions.showNewest).toHaveBeenCalledOnce();
  },
});

export const AgentTurnReadsAsATurn = meta.story({
  name: "(Test) A coding agent's turn reads as a turn",
  args: { model: openedOn(traceIn(agentTurn, { hasOpenedTrace: true })) },
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(
      view.getByRole("heading", { name: "Your first Claude Code turn is in" }),
    ).toBeVisible();
    await expect(view.getByText("17 steps · 14 tool calls")).toBeVisible();
    await expect(
      view.getByRole("link", { name: "Open the session" }),
    ).toBeVisible();
    await expect(
      view.getByRole("heading", { name: "Also trace your app" }),
    ).toBeVisible();
  },
});

export const AppTraceOffersANewProject = meta.story({
  name: "(Test) After an app trace, agents set up in a new project",
  args: BackFromTheTrace.input.args,
  render: LiveView,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(
      view.getByRole("button", { name: "Set up Claude Code in a new project" }),
    );
    const panel = within(
      await view.findByRole("region", { name: "Claude Code" }),
    );
    await expect(
      panel.getByRole("textbox", { name: "Project name" }),
    ).toHaveValue("Coding agents");
    await userEvent.click(
      panel.getByRole("button", { name: "Create project and keys" }),
    );
    await expect(
      await panel.findByRole("heading", {
        name: "Put the new project's keys in .env",
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Open Coding agents" }),
    ).toBeVisible();
  },
});

export const ReceiptStandsAlone = meta.story({
  name: "(Test) The first trace has the row to itself until it's opened",
  args: FirstTraceIn.input.args,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(
      view.queryByRole("button", { name: /^Set up Claude Code/ }),
    ).toBeNull();
    await expect(
      view.getByRole("heading", { name: "Score every answer like this one" }),
    ).toBeVisible();
  },
});

export const ScoreLandsOnTheReceipt = meta.story({
  name: "(Test) The score lands on the receipt",
  args: SetUp.input.args,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByText("Helpfulness 0.92")).toBeVisible();
    await expect(
      view.getByRole("heading", { name: "You're set up" }),
    ).toBeVisible();
  },
});

export const SkipKeepsTheGate = meta.story({
  name: "(Test) Skipping a gate moves on and keeps it to pick up",
  args: { model: openedOn(traceIn(errorTrace)) },
  render: LiveView,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole("button", { name: "Not now" }));
    await expect(
      view.getByRole("heading", { name: "Score every answer like this one" }),
    ).toBeVisible();
    await userEvent.click(
      view.getByRole("button", { name: "Fix the failed step" }),
    );
    await expect(
      view.getByRole("heading", { name: "Find why it failed" }),
    ).toBeVisible();
  },
});

export const OffersTheDemo = meta.story({
  name: "(Test) The way in offers a demo chat",
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Try the demo chat" }),
    );
    await expect(args.actions.startDemo).toHaveBeenCalledOnce();
  },
});

export const DemoHandsOverToTheSetup = meta.story({
  name: "(Test) A demo trace hands over to the app's setup",
  args: { model: openedOn(steps.demoAnswered) },
  play: async ({ args, canvasElement }) => {
    const view = within(canvasElement);
    // The demo trace rises in over 260 ms
    await waitFor(() => expect(view.getByText("demo-chat")).toBeVisible());
    await userEvent.click(
      view.getByRole("button", { name: "Set up your app" }),
    );
    await expect(args.actions.pickWay).toHaveBeenCalledWith({
      kind: "app",
      integration: null,
    });
  },
});
