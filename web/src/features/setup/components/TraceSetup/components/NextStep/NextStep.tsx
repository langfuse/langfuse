"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowRight } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { SpotIllustration } from "@/src/components/design-system/SpotIllustration/SpotIllustration";
import { LangfuseIllustration } from "@/src/components/design-system/LangfuseIllustration/LangfuseIllustration";
import { cn } from "@/src/utils/tailwind";
import type { TraceReading } from "../../firstTrace";
import {
  isSetUp,
  nextGateOf,
  openGatesOf,
  type Gate,
  type OpenGate,
} from "../../gates";
import type { FirstTrace, Scoring } from "../../types";

/** Longer asks keep their start and end, the span name cut in the middle, so a button stays inside the card. */
const ASK_LENGTH = 44;

const shortAsk = (ask: string) =>
  ask.length <= ASK_LENGTH
    ? ask
    : `${ask.slice(0, ASK_LENGTH - 18)}…${ask.slice(-17)}`;

/** The model providers the card connects, as the LLM connections settings name them. */
const PROVIDERS = ["OpenAI", "Anthropic", "Azure OpenAI", "Bedrock", "Google"];

/** The judges offered for a first trace, from Langfuse's managed evaluators. */
const JUDGES = {
  app: ["Helpfulness", "Correctness", "Hallucination"],
  agent: ["Did it do what you asked?", "Helpfulness"],
} as const;

type NextStepProps = {
  trace: Pick<FirstTrace, "href" | "source">;
  /** The trace as `readingOf` reads it, once per trace. */
  reading: Pick<TraceReading, "failed" | "tip" | "haloAsks">;
  scoring: Scoring;
  projectId: string;
  /** The in-app agent is on for this project, so Halo sets scoring up instead of the form. */
  isHaloOn: boolean;
  /** Someone else has joined the project. */
  hasTeammates: boolean;
  /** Gates moved past with "Not now", kept to pick up from the ladder. */
  skippedGates: readonly Gate[];
  /** The trace came in while you watched; the same for as long as the step is on screen. */
  shouldAnimate: boolean;
  onSkipGate: (gate: Gate) => void;
  onResumeGate: (gate: Gate) => void;
  onConnectModel: (provider: string, apiKey: string) => void;
  onPickJudge: (judge: string) => void;
  onAskHalo: (ask: string) => void;
};

/** A spot drawing above the title, or Halo's scene beside it (too tall to sit above). */
type StepArt =
  | {
      kind: "spot";
      drawing: "evaluators" | "failedSpan" | "instrument" | "members";
    }
  | { kind: "halo" };

function Art({ art }: { art: StepArt }) {
  switch (art.kind) {
    case "spot":
      return (
        <SpotIllustration
          drawing={art.drawing}
          size="sm"
          motion="subtle"
          backdrop="none"
          accent="none"
        />
      );
    case "halo":
      return (
        <div className="mx-auto w-full max-w-64 sm:col-start-2 sm:row-start-1">
          <LangfuseIllustration
            variant="halo"
            motion="once"
            floor="none"
            accent="none"
            a11y="decorative"
            content={{ active: 0 }}
          />
        </div>
      );
  }
}

function StepCard({
  art,
  title,
  lead,
  onSkip,
  children,
}: {
  art: StepArt;
  title: string;
  lead: string;
  /** Moves on to the next gate without passing this one; `null` where there's nothing to skip. */
  onSkip: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ph-no-capture gap-3 rounded-xl border border-dashed p-5",
        art.kind === "halo"
          ? "grid items-center sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)] sm:gap-x-5"
          : "flex flex-col",
      )}
    >
      <Art art={art} />
      <div className="flex flex-col gap-3 sm:col-start-1 sm:row-start-1">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="text-muted-foreground text-sm">{lead}</p>
      </div>
      <div className="flex flex-col items-start gap-2.5 sm:col-span-full">
        {children}
        {onSkip ? (
          <Button text="Not now" variant="text" size="sm" onClick={onSkip} />
        ) : null}
      </div>
    </div>
  );
}

function HaloStep({
  asks,
  onAskHalo,
  onSkip,
}: Pick<NextStepProps, "onAskHalo"> & {
  asks: readonly string[];
  onSkip: () => void;
}) {
  return (
    <StepCard
      onSkip={onSkip}
      art={{ kind: "halo" }}
      title="Let Halo take it from here"
      lead="Halo is Langfuse's agent. Ask in plain words and it works in your project: reads traces, sets up evaluators, edits prompts, builds datasets."
    >
      <ul aria-label="Ask Halo" className="flex max-w-full flex-wrap gap-1.5">
        {asks.map((ask) => (
          <li
            key={ask}
            className="max-w-full"
            title={ask.length > ASK_LENGTH ? ask : undefined}
          >
            <Button
              text={shortAsk(ask)}
              variant="secondary"
              size="sm"
              onClick={() => onAskHalo(ask)}
            />
          </li>
        ))}
      </ul>
    </StepCard>
  );
}

function ConnectModel({
  isConnecting,
  onConnectModel,
}: {
  isConnecting: boolean;
  onConnectModel: NextStepProps["onConnectModel"];
}) {
  const id = useId();
  const [provider, setProvider] = useState(PROVIDERS[0] ?? "OpenAI");
  const [apiKey, setApiKey] = useState("");
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (apiKey.trim() !== "") onConnectModel(provider, apiKey.trim());
      }}
    >
      <fieldset>
        <legend className="text-foreground-secondary mb-2 text-xs">
          Model provider
        </legend>
        <RadioGroup value={provider} onValueChange={setProvider}>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((name) => (
              <label
                key={name}
                htmlFor={`${id}-${name}`}
                className="bg-background has-data-[state=checked]:border-primary-accent flex h-7 cursor-pointer items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs"
              >
                <RadioGroup.Item
                  id={`${id}-${name}`}
                  value={name}
                  disabled={isConnecting}
                />
                {name}
              </label>
            ))}
          </div>
        </RadioGroup>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <PasswordInput
            aria-label={`${provider} API key`}
            placeholder={`${provider} API key`}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            disabled={isConnecting}
            required
          />
        </div>
        <Button
          type="submit"
          text="Test and save"
          size="sm"
          loading={isConnecting}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Saved as an LLM connection for your organization; Langfuse only calls it
        to score.
      </p>
    </form>
  );
}

function PickJudge({
  provider,
  judges,
  onPickJudge,
}: {
  provider: string;
  judges: readonly string[];
  onPickJudge: NextStepProps["onPickJudge"];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-foreground-secondary text-xs">
        {provider} is connected. What should the judge look for?
      </p>
      <div role="group" aria-label="Judges" className="flex flex-wrap gap-1.5">
        {judges.map((judge) => (
          <Button
            key={judge}
            text={judge}
            variant="secondary"
            size="sm"
            onClick={() => onPickJudge(judge)}
          />
        ))}
      </div>
    </div>
  );
}

/** What the score card asks for at each point of scoring before the score lands. */
function ScoringControl({
  scoring,
  judges,
  onConnectModel,
  onPickJudge,
}: Pick<NextStepProps, "onConnectModel" | "onPickJudge"> & {
  scoring: Extract<OpenGate, { gate: "keepsWorking" }>["scoring"];
  judges: readonly string[];
}) {
  switch (scoring.status) {
    case "noModel":
    case "connecting":
      return (
        <ConnectModel
          isConnecting={scoring.status === "connecting"}
          onConnectModel={onConnectModel}
        />
      );
    case "pickJudge":
      return (
        <PickJudge
          provider={scoring.provider}
          judges={judges}
          onPickJudge={onPickJudge}
        />
      );
    case "judging":
      return (
        <p
          role="status"
          className="text-muted-foreground flex items-center gap-2 text-sm"
        >
          <Spinner size="sm" />
          Scoring this trace for {scoring.judge}…
        </p>
      );
  }
}

/** Connect a model, pick a judge, score this trace: the reward lands on the receipt. */
function ScoreStep({
  trace,
  scoring,
  onConnectModel,
  onPickJudge,
  onSkip,
}: Pick<NextStepProps, "trace" | "onConnectModel" | "onPickJudge"> &
  Pick<Extract<OpenGate, { gate: "keepsWorking" }>, "scoring"> & {
    onSkip: () => void;
  }) {
  const isAgentTurn = trace.source.kind === "agent";
  return (
    <StepCard
      onSkip={onSkip}
      art={{ kind: "spot", drawing: "evaluators" }}
      title={
        isAgentTurn
          ? "Score your agent's turns"
          : "Score every answer like this one"
      }
      lead={
        isAgentTurn
          ? "An LLM judge rates each turn, starting with this one. It runs on a model you connect."
          : "An LLM judge rates each new trace, starting with this one. It runs on a model you connect."
      }
    >
      <ScoringControl
        scoring={scoring}
        judges={JUDGES[trace.source.kind]}
        onConnectModel={onConnectModel}
        onPickJudge={onPickJudge}
      />
    </StepCard>
  );
}

/** The open gate's card: what the project needs next, and how to get it. Every gate has its own case. */
function GateStep({
  open,
  onSkip,
  ...props
}: NextStepProps & { open: OpenGate; onSkip: () => void }) {
  switch (open.gate) {
    case "nothingBroken":
      return (
        <StepCard
          art={{ kind: "spot", drawing: "failedSpan" }}
          title="Find why it failed"
          lead={`${open.failed.name} failed${open.failed.statusMessage ? `: ${open.failed.statusMessage}` : ""}. Fix it, and the next clean trace moves you on.`}
          onSkip={onSkip}
        >
          <Button
            text="Open the failed step"
            variant="secondary"
            size="sm"
            trailingIcon={ArrowRight}
            href={`${props.trace.href}?observation=${open.failed.id}`}
          />
        </StepCard>
      );
    case "usableData":
      return (
        <StepCard
          art={{ kind: "spot", drawing: "instrument" }}
          title="Make it readable"
          lead={`${open.tip.text} Cost, scores and the playground read these.`}
          onSkip={onSkip}
        >
          <Button
            text={open.tip.action}
            variant="secondary"
            size="sm"
            trailingIcon={ArrowRight}
            href={open.tip.href}
          />
        </StepCard>
      );
    case "keepsWorking":
      if (props.isHaloOn)
        return (
          <HaloStep
            asks={props.reading.haloAsks}
            onAskHalo={props.onAskHalo}
            onSkip={onSkip}
          />
        );
      return (
        <ScoreStep
          trace={props.trace}
          scoring={open.scoring}
          onConnectModel={props.onConnectModel}
          onPickJudge={props.onPickJudge}
          onSkip={onSkip}
        />
      );
    case "shared":
      return (
        <StepCard
          art={{ kind: "spot", drawing: "members" }}
          title="Bring your team in"
          lead="They land in this project, with these traces."
          onSkip={onSkip}
        >
          <Button
            text="Invite your team"
            variant="secondary"
            size="sm"
            href={`/project/${props.projectId}/settings/members`}
          />
        </StepCard>
      );
  }
}

/** The project is set up: traces arrive clean and an evaluator scores each one; inviting the team stays on offer. */
function SetUpStep({
  scoring,
  projectId,
  hasTeammates,
}: Pick<NextStepProps, "scoring" | "projectId" | "hasTeammates">) {
  return (
    <StepCard
      art={{ kind: "spot", drawing: "evaluators" }}
      title="You're set up"
      lead={
        scoring.status === "scored"
          ? `Traces arrive, nothing is broken, and ${scoring.score.name} scores every new one.`
          : "Traces arrive, nothing is broken, and every new one is scored."
      }
      onSkip={null}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          text="Go to your project"
          size="sm"
          trailingIcon={ArrowRight}
          href={`/project/${projectId}`}
        />
        {hasTeammates ? null : (
          <Button
            text="Invite your team"
            variant="ghost"
            size="sm"
            href={`/project/${projectId}/settings/members`}
          />
        )}
        {scoring.status === "scored" ? (
          <Button
            text="Edit the evaluator"
            variant="text"
            size="sm"
            href={scoring.evaluatorHref}
          />
        ) : null}
      </div>
    </StepCard>
  );
}

/** How a skipped gate is offered back, by what picking it up does. */
const RESUME_TEXT: Record<Gate, string> = {
  nothingBroken: "Fix the failed step",
  usableData: "Make it readable",
  keepsWorking: "Score new traces",
  shared: "Invite your team",
};

/** The gates skipped with "Not now" that are still open, each a link back to its card. */
function Skipped({
  gates,
  onResume,
}: {
  gates: readonly Gate[];
  onResume: (gate: Gate) => void;
}) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
      Skipped for now:
      {gates.map((gate) => (
        <Button
          key={gate}
          text={RESUME_TEXT[gate]}
          variant="text"
          size="sm"
          onClick={() => onResume(gate)}
        />
      ))}
    </p>
  );
}

/** The card: set up, the next open gate, or a note that the rest is skipped. */
function NextCard({
  isDone,
  current,
  ...props
}: NextStepProps & { isDone: boolean; current: OpenGate | null }) {
  if (isDone) return <SetUpStep {...props} />;
  if (current)
    return (
      <GateStep
        {...props}
        open={current}
        onSkip={() => props.onSkipGate(current.gate)}
      />
    );
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed p-5 text-sm">
      The rest is skipped for now. Pick one up below.
    </p>
  );
}

/**
 * The best next step beside the first trace: the first gate the project hasn't passed or skipped, read from the
 * trace, its scoring and the team, so it moves on when they change.
 */
export function NextStep(props: NextStepProps) {
  const open = openGatesOf(props);
  const isDone = isSetUp(open);
  const current = nextGateOf(open, props.skippedGates);
  const skipped = props.skippedGates.filter((gate) =>
    open.some((each) => each.gate === gate),
  );
  return (
    <div className="order-last flex flex-col gap-3 self-start">
      <NextCard {...props} isDone={isDone} current={current} />
      {!isDone && skipped.length > 0 ? (
        <Skipped gates={skipped} onResume={props.onResumeGate} />
      ) : null}
    </div>
  );
}
