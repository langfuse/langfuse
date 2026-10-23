"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { cn } from "@/src/utils/tailwind";
import motion from "../../motion.module.css";
import { receiptOf } from "../../firstTrace";
import type { DemoTurn } from "../../types";
import { LiveDot } from "../LiveDot/LiveDot";
import { TracePreview } from "../TracePreview/TracePreview";

/** What to ask the demo app first, each answered by its script. */
const QUESTIONS = [
  "What does Langfuse do?",
  "How do I cut my LLM costs?",
  "Why did my agent loop?",
];

type DemoChatProps = {
  turns: DemoTurn[];
  /** Asks the demo app; its answer and trace come back as the turn's. */
  onSend: (question: string) => void;
  /** Sets up the app, from what the demo showed. */
  onSetUpApp: () => void;
  /** Back to the two ways in. */
  onLeave: () => void;
};

/** The latest exchange's trace as it lands, or where it will. */
function LiveTrace({ turn }: { turn: DemoTurn | undefined }) {
  if (turn?.trace)
    return (
      <div
        key={turn.trace.id}
        className={cn(
          "bg-background flex flex-col gap-3 rounded-xl border p-4 shadow-xs",
          motion.stagger,
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className="truncate font-mono text-sm font-bold"
            title={turn.trace.name}
          >
            {turn.trace.name}
          </span>
          <span className="bg-muted text-foreground-secondary rounded-full px-2 py-0.5 text-xs">
            demo
          </span>
        </div>
        <TracePreview receipt={receiptOf(turn.trace)} />
      </div>
    );
  return (
    <div className="text-muted-foreground flex min-h-40 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm">
      {turn ? (
        <>
          <LiveDot isLive />
          Building the trace…
        </>
      ) : (
        "The trace of your first message lands here, step by step."
      )}
    </div>
  );
}

/** The trace column's news for screen readers: building, then in. */
function traceNewsOf(turn: DemoTurn | undefined) {
  if (!turn) return "";
  if (turn.trace) return "The trace is in";
  return "Building the trace";
}

/** The message box, holding its own draft so typing doesn't redraw the chat and its trace. */
function Composer({
  isAnswering,
  onSend,
}: Pick<DemoChatProps, "onSend"> & { isAnswering: boolean }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="flex gap-2 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() === "" || isAnswering) return;
        onSend(draft.trim());
        setDraft("");
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          aria-label="Message to the demo app"
          placeholder="Ask the demo app…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isAnswering}
          autoComplete="off"
        />
      </div>
      <Button
        type="submit"
        text="Send"
        size="sm"
        disabled={isAnswering || draft.trim() === ""}
      />
    </form>
  );
}

/**
 * Langfuse before any code: a chat with a scripted demo app, its trace building beside it. Every message is one demo
 * trace, kept out of the numbers; once one is in, setting up your own app is one click away.
 */
export function DemoChat({
  turns,
  onSend,
  onSetUpApp,
  onLeave,
}: DemoChatProps) {
  const latest = turns.at(-1);
  const isAnswering = latest !== undefined && latest.answer === null;
  const unasked = QUESTIONS.filter(
    (question) => !turns.some((turn) => turn.question === question),
  );
  return (
    <div className="bg-muted/60 grid gap-5 rounded-2xl p-6 md:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="ph-no-capture bg-background flex min-h-80 flex-col rounded-xl border shadow-xs">
        <div className="flex items-baseline gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-bold">Demo app</h2>
          <span className="text-muted-foreground text-xs">
            answers from a script, traced by Langfuse
          </span>
        </div>
        <ol
          aria-label="Chat"
          aria-live="polite"
          className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4 text-sm"
        >
          {turns.length === 0 ? (
            <li className="text-muted-foreground m-auto max-w-64 text-center text-xs">
              Ask the demo app anything. Its answer comes with a trace.
            </li>
          ) : null}
          {turns.map((turn, index) => (
            <li key={index} className="flex flex-col gap-2.5">
              <p className="bg-foreground text-background max-w-[85%] self-end rounded-2xl rounded-br-md px-3 py-2">
                {turn.question}
              </p>
              <p className="bg-muted max-w-[85%] self-start rounded-2xl rounded-bl-md px-3 py-2">
                {turn.answer ?? (
                  <span className="text-muted-foreground">Answering…</span>
                )}
              </p>
            </li>
          ))}
        </ol>
        {unasked.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {unasked.map((question) => (
              <Button
                key={question}
                text={question}
                variant="secondary"
                size="sm"
                disabled={isAnswering}
                onClick={() => onSend(question)}
              />
            ))}
          </div>
        ) : null}
        <Composer isAnswering={isAnswering} onSend={onSend} />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-muted-foreground text-xs font-bold">Live trace</h3>
        <p role="status" className="sr-only">
          {traceNewsOf(latest)}
        </p>
        <LiveTrace turn={latest} />
        {latest?.trace ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-sm text-pretty">
              That&apos;s a trace: every step of the answer, with its timing and
              cost. Your app&apos;s will look like this. Demo traces stay out of
              your numbers.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                text="Set up your app"
                size="sm"
                trailingIcon={ArrowRight}
                onClick={onSetUpApp}
              />
            </div>
          </div>
        ) : null}
        <span className="mt-auto">
          <Button
            text="Back to the ways in"
            variant="text"
            size="sm"
            icon={ArrowLeft}
            onClick={onLeave}
          />
        </span>
      </div>
    </div>
  );
}
