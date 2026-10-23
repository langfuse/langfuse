"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowRight, Check } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { IllustrationHost } from "@/src/components/design-system/IllustrationHost/IllustrationHost";
import { IntegrationLogo } from "@/src/components/design-system/IntegrationLogo/IntegrationLogo";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";
import {
  CATEGORY_TITLES,
  integrationOf,
} from "../../../../integrations/catalog";
import { logoOf } from "../../../../integrations/logos";
import type { Integration } from "../../../../integrations/types";
import { buildAgentPrompt } from "../../agentPrompt";
import { codingAgentOf } from "../../codingAgents";
import {
  agentOf,
  firstTraceTitle,
  readingOf,
  type Receipt,
} from "../../firstTrace";
import motion from "../../motion.module.css";
import type {
  CopyChecks,
  ProjectKeys,
  Scoring,
  SetupProject,
  TraceSetupActions,
  TraceSetupState,
  Way,
} from "../../types";
import { AgentChips } from "../AgentChips/AgentChips";
import { EnvStep } from "../EnvStep/EnvStep";
import { IntegrationSteps } from "../IntegrationSteps/IntegrationSteps";
import { LiveDot } from "../LiveDot/LiveDot";
import { NextStep } from "../NextStep/NextStep";
import { NumberedStep } from "../NumberedStep/NumberedStep";
import { TracePreview } from "../TracePreview/TracePreview";

/** The page stops checking after this long without a new trace, and the dot goes still with it. */
const LIVE_SECONDS = 600;

type SetupStep = Extract<TraceSetupState, { step: "setup" }>;
type TraceInStep = Extract<TraceSetupState, { step: "traceIn" }>;

type SetupCardProps = {
  setup: SetupStep | TraceInStep;
  keys: ProjectKeys;
  project: SetupProject;
  /** Its body changed in front of you, so its parts rise in one after another. */
  shouldAnimate: boolean;
  actions: TraceSetupActions;
  /** Opens every integration on a category (`null` is all), to pick the stack or another agent. */
  onBrowse: (category: string | null) => void;
};

/** What the card's body needs besides its step. */
type CardParts = Pick<
  SetupCardProps,
  "keys" | "project" | "shouldAnimate" | "actions" | "onBrowse"
>;

type SetupParts = CardParts & { copied: CopyChecks };

/** The white panel that floats on the tile, for what you copy or read. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background rounded-xl border p-4 shadow-xs">
      {children}
    </div>
  );
}

/** The bottom of the card while it's set up: it listens for the first trace (or turn) from the moment it opens. */
function Listening({
  source,
}: {
  source: { kind: "app" } | { kind: "agent"; agentName: string };
}) {
  return (
    <div className="flex items-start gap-2.5 border-t pt-4 text-sm">
      <span className="mt-1.5">
        <LiveDot isLive />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-bold">
          Listening for your first {source.kind === "app" ? "trace" : "turn"}…
        </p>
        {source.kind === "app" ? (
          <p className="text-muted-foreground text-xs">
            It shows up here the moment it&apos;s sent. Nothing after a minute?
            Check <code className="font-mono">LANGFUSE_BASE_URL</code> and that
            your app flushes before it exits.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            It shows up here the moment it&apos;s sent. Nothing after a minute?
            Check that the {source.agentName} plugin is installed and can read
            your keys.
          </p>
        )}
      </div>
    </div>
  );
}

/** Which stack the app's setup is for: any (the prompt picks), or one integration, with the way to change it. */
function StackSwitcher({
  integration,
  onPickWay,
  onBrowse,
}: {
  integration: Integration | undefined;
  onPickWay: (way: Way) => void;
  onBrowse: (category: string | null) => void;
}) {
  const name = integration?.name ?? "Any stack";
  const detail = integration
    ? (CATEGORY_TITLES[integration.category] ?? "")
    : "The prompt picks the integration";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {integration ? (
          <IntegrationLogo
            name={integration.name}
            {...logoOf(integration.slug)}
            size="md"
            shape="rounded"
            isDecorative
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-background text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg border border-dashed text-xs font-bold"
          >
            Any
          </span>
        )}
        <h2 className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold" title={name}>
            {name}
          </span>
          <span
            className="text-muted-foreground truncate text-xs"
            title={detail}
          >
            {detail}
          </span>
        </h2>
      </div>
      <div className="flex items-center gap-1">
        {integration ? (
          <Button
            text="Use any stack"
            variant="ghost"
            size="sm"
            onClick={() => onPickWay({ kind: "app", integration: null })}
          />
        ) : null}
        <Button
          text={integration ? "Change" : "Pick your stack"}
          variant="secondary"
          size="sm"
          onClick={() => onBrowse(integration?.category ?? null)}
        />
      </div>
    </div>
  );
}

/** Under the prompt: whose guide the agent follows, or that it fits any stack. */
function PromptNote({ integration }: { integration: Integration | undefined }) {
  if (!integration)
    return (
      <p className="text-muted-foreground text-xs">
        Works in any coding agent, for any stack: it picks the integration that
        fits.
      </p>
    );
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
      Your agent follows the {integration.name} guide. Or follow it by hand:
      <Button
        text={`${integration.name} guide`}
        variant="text"
        size="sm"
        href={integration.href}
      />
    </p>
  );
}

/** An app's setup: which stack, then two pastes (the keys into .env, the one prompt into a coding agent), each checked once copied. */
function AppSetup({
  integrationSlug,
  copied,
  keys,
  project,
  shouldAnimate,
  actions,
  onBrowse,
}: SetupParts & { integrationSlug: string | null }) {
  const integration =
    integrationSlug === null ? undefined : integrationOf(integrationSlug);
  return (
    <>
      <StackSwitcher
        integration={integration}
        onPickWay={actions.pickWay}
        onBrowse={onBrowse}
      />
      <Panel>
        <ol className="flex flex-col">
          <NumberedStep number={1} isDone={copied.env}>
            <EnvStep
              target={{ kind: "app" }}
              keys={keys}
              baseUrl={project.baseUrl}
              manageKeysPath={`/project/${project.id}/settings/api-keys`}
              onCreateKeys={actions.createKeys}
              onCopyEnv={() => actions.copy("env")}
              shouldAnimate={shouldAnimate}
            />
          </NumberedStep>
          <NumberedStep number={2} isDone={copied.setup}>
            <CodeSection
              title="Hand it to your coding agent"
              content={buildAgentPrompt({
                baseUrl: project.baseUrl,
                integration: integration ?? null,
              })}
              copyButton={{ text: "Copy prompt", variant: "primary" }}
              expandLabel="Show the full prompt"
              onCopy={() => actions.copy("setup")}
            />
            <PromptNote integration={integration} />
          </NumberedStep>
        </ol>
      </Panel>
      <Listening source={{ kind: "app" }} />
    </>
  );
}

/** A coding agent's setup: which agent, then its plugin's steps, each checked once copied. */
function AgentSetup({
  agent,
  copied,
  keys,
  project,
  shouldAnimate,
  actions,
  onBrowse,
}: SetupParts & { agent: Integration }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold">Your coding agent</h2>
        <AgentChips
          current={agent.slug}
          onPick={(slug) => actions.pickWay({ kind: "agent", slug })}
          onBrowseMore={() => onBrowse("developer-tools")}
        />
      </div>
      <Panel>
        <IntegrationSteps
          key={agent.slug}
          integration={agent}
          target={{ project: "this" }}
          keys={keys}
          baseUrl={project.baseUrl}
          manageKeysPath={`/project/${project.id}/settings/api-keys`}
          onCreateKeys={actions.createKeys}
          copied={copied}
          onCopy={actions.copy}
          shouldAnimate={shouldAnimate}
        />
      </Panel>
      <Listening source={{ kind: "agent", agentName: agent.name }} />
    </>
  );
}

/** The card's body while it listens: the app's setup or the coding agent's, rising in as it opens in front of you. */
function SetupBody({ setup, ...parts }: CardParts & { setup: SetupStep }) {
  const agent =
    setup.way.kind === "agent" ? codingAgentOf(setup.way.slug) : undefined;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-4",
        parts.shouldAnimate && motion.stagger,
      )}
    >
      {agent ? (
        <AgentSetup {...parts} copied={setup.copied} agent={agent} />
      ) : (
        <AppSetup
          {...parts}
          copied={setup.copied}
          integrationSlug={
            setup.way.kind === "app" ? setup.way.integration : null
          }
        />
      )}
    </div>
  );
}

/** The judge's score on the first trace, its reason a hover or focus away: the reward for connecting a model. */
function ScoreChip({
  score,
}: {
  score: Extract<Scoring, { status: "scored" }>["score"];
}) {
  return (
    <div className="flex items-center gap-2 border-t pt-3 text-xs">
      <span className="bg-dark-green/10 text-foreground inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-bold">
        <Check size="sm" aria-hidden="true" />
        {score.name} {score.value.toFixed(2)}
      </span>
      <Tooltip label={score.reason}>
        {({ getTriggerProps }) => (
          <button
            type="button"
            className="text-link hover:text-link-hover text-xs font-bold"
            {...getTriggerProps()}
          >
            Why?
          </button>
        )}
      </Tooltip>
      <span role="status" className="sr-only">
        Scored {score.name} {score.value.toFixed(2)}: {score.reason}
      </span>
    </div>
  );
}

function agoText(seconds: number) {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/** Above the receipt once more came in: how many, how recent, and the newest one waiting for "show". */
function TraceCount({
  setup,
  unit,
  shouldAnimate,
  onShowNewest,
}: {
  setup: TraceInStep;
  unit: "trace" | "turn";
  /** The count ticks up in front of you, not on the page it opened on. */
  shouldAnimate: boolean;
  onShowNewest: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <p className="text-muted-foreground flex items-center gap-2">
        <LiveDot isLive={setup.secondsSinceLatest < LIVE_SECONDS} />
        <span role="status">
          <span
            key={setup.traceCount}
            className={cn("inline-block", shouldAnimate && motion.countIn)}
          >
            {setup.traceCount} {unit}s
          </span>
        </span>
        <span aria-hidden="true">
          · latest {agoText(setup.secondsSinceLatest)}
        </span>
      </p>
      {setup.newer ? (
        <Button
          text={`New ${unit} · show`}
          variant="secondary"
          size="sm"
          onClick={onShowNewest}
        />
      ) : null}
    </div>
  );
}

/** The first trace as a receipt: its name, what it did, its score once judged, and the way into it. */
function FirstTraceStep({
  setup,
  receipt,
  shouldAnimate,
  onShowNewest,
}: {
  setup: TraceInStep;
  receipt: Receipt;
  shouldAnimate: boolean;
  onShowNewest: () => void;
}) {
  const { trace } = setup;
  const agent = agentOf(trace);
  return (
    <>
      {setup.traceCount > 1 ? (
        <TraceCount
          setup={setup}
          unit={agent ? "turn" : "trace"}
          shouldAnimate={shouldAnimate}
          onShowNewest={onShowNewest}
        />
      ) : null}
      <div key={trace.id} className={cn(setup.isNewerShown && motion.swapIn)}>
        <Panel>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                {agent ? (
                  <IntegrationLogo
                    name={agent.name}
                    {...logoOf(agent.slug)}
                    size="sm"
                    shape="rounded"
                    isDecorative
                  />
                ) : null}
                <span
                  className="ph-no-capture truncate font-mono text-sm font-bold"
                  title={trace.name}
                >
                  {trace.name}
                </span>
              </span>
              {setup.newer ? null : (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {agoText(setup.secondsSinceLatest)}
                </span>
              )}
            </div>
            <TracePreview receipt={receipt} />
            {setup.scoring.status === "scored" ? (
              <ScoreChip score={setup.scoring.score} />
            ) : null}
          </div>
        </Panel>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          text={agent ? "Open the session" : "Open the trace"}
          href={agent ? agent.sessionHref : trace.href}
          trailingIcon={ArrowRight}
        />
        <span className="text-muted-foreground text-sm">
          or pick a job below
        </span>
      </div>
    </>
  );
}

/** The card's body once the trace is in: the next step beside the receipt, both read from one walk of the trace. */
function TraceInBody({
  setup,
  project,
  shouldAnimate,
  actions,
}: Pick<SetupCardProps, "project" | "shouldAnimate" | "actions"> & {
  setup: TraceInStep;
}) {
  const reading = useMemo(() => readingOf(setup.trace), [setup.trace]);
  return (
    <>
      <NextStep
        trace={setup.trace}
        reading={reading}
        scoring={setup.scoring}
        projectId={project.id}
        isHaloOn={project.isHaloOn}
        hasTeammates={project.hasTeammates}
        skippedGates={setup.skippedGates}
        shouldAnimate={shouldAnimate}
        onSkipGate={actions.skipGate}
        onResumeGate={actions.resumeGate}
        onConnectModel={actions.connectModel}
        onPickJudge={actions.pickJudge}
        onAskHalo={actions.askHalo}
      />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-4",
          shouldAnimate && motion.stagger,
        )}
      >
        <FirstTraceStep
          setup={setup}
          receipt={reading.receipt}
          shouldAnimate={shouldAnimate}
          onShowNewest={actions.showNewest}
        />
      </div>
    </>
  );
}

/**
 * The setup tile: the way picked, set up step by step while it listens for the first trace, then that trace with the
 * next step beside it (below it once the other way in shares the row).
 */
export function SetupCard({ setup, ...parts }: SetupCardProps) {
  const isReceiptAlone = setup.step === "traceIn" && !setup.hasOpenedTrace;
  return (
    <IllustrationHost>
      <div
        className={cn(
          "bg-muted/60 relative flex h-full flex-col gap-5 rounded-2xl p-6 md:p-7",
          isReceiptAlone &&
            "lg:grid lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:gap-6",
        )}
      >
        <p className="sr-only" aria-live="polite">
          {setup.step === "traceIn"
            ? firstTraceTitle(setup.trace)
            : "Step 2 of 3: set up tracing. Listening for your first trace."}
        </p>
        {setup.step === "traceIn" ? (
          <TraceInBody setup={setup} {...parts} />
        ) : (
          <SetupBody setup={setup} {...parts} />
        )}
      </div>
    </IllustrationHost>
  );
}
