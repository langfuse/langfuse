"use client";

import { ExternalLink } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { cn } from "@/src/utils/tailwind";

type GreenfieldDocSignalsSection =
  | "overview"
  | "iterate"
  | "evaluate"
  | "deploy"
  | "monitor";

type DocLink = {
  label: string;
  href: string;
};

type DocIndicator = {
  id: string;
  label: string;
  missing: string;
  why: string;
  placement: string;
  docs: DocLink[];
};

type SectionConfig = {
  title: string;
  description: string;
  items: DocIndicator[];
};

const DOC_SIGNAL_SECTIONS: Record<GreenfieldDocSignalsSection, SectionConfig> =
  {
    overview: {
      title: "Readiness signals",
      description:
        "Hover a light to see exactly what Greenfield is missing on this page, why it matters, and where it should appear.",
      items: [
        {
          id: "tracing-live",
          label: "Tracing live",
          missing:
            "Greenfield does not show whether this project is sending traces yet.",
          why: "Without this, users cannot tell if evaluation and monitoring can work at all.",
          placement:
            "Put this in the Overview readiness strip at the top of the page.",
          docs: [
            {
              label: "Start Tracing",
              href: "https://langfuse.com/docs/observability/get-started",
            },
            {
              label: "Observability Overview",
              href: "https://langfuse.com/docs/observability/overview",
            },
          ],
        },
        {
          id: "prompt-trace-link",
          label: "Prompt linked to traces",
          missing:
            "Greenfield does not show whether this prompt is linked to real traces.",
          why: "Without this, prompt metrics and prompt-version monitoring are disconnected from reality.",
          placement:
            "Put this next to tracing status in the Overview readiness strip.",
          docs: [
            {
              label: "Link Prompts to Traces",
              href: "https://langfuse.com/docs/prompt-management/features/link-to-traces",
            },
          ],
        },
        {
          id: "dataset-ready",
          label: "Dataset ready",
          missing:
            "Greenfield does not show whether a dataset already exists for this prompt flow.",
          why: "Without this, users do not know if they can run structured offline evaluation yet.",
          placement:
            "Put this in the Overview starter steps and readiness strip.",
          docs: [
            {
              label: "Datasets",
              href: "https://langfuse.com/docs/evaluation/experiments/overview",
            },
          ],
        },
        {
          id: "human-scoring",
          label: "Human scoring ready",
          missing:
            "Greenfield does not show whether human review is set up for this prompt workflow.",
          why: "Without this, users cannot tell if they have a human baseline for quality.",
          placement:
            "Put this in the Overview readiness strip near dataset and evaluator status.",
          docs: [
            {
              label: "Manual Scores via UI",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-ui",
            },
            {
              label: "Annotation Queues",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues",
            },
          ],
        },
        {
          id: "evaluator-ready",
          label: "Evaluator configured",
          missing:
            "Greenfield does not show whether an evaluator has been configured yet.",
          why: "Without this, users do not know if automated evaluation is ready to run.",
          placement:
            "Put this in the Overview readiness strip and starter steps.",
          docs: [
            {
              label: "LLM-as-a-Judge",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
            },
          ],
        },
        {
          id: "recent-experiment",
          label: "Recent experiment",
          missing:
            "Greenfield does not show the latest experiment result or that no experiment has been run yet.",
          why: "Without this, users cannot tell whether there is evidence for the current prompt candidate.",
          placement:
            "Put this in the Overview top summary and the starter steps area.",
          docs: [
            {
              label: "Experiments via UI",
              href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-ui",
            },
          ],
        },
      ],
    },
    iterate: {
      title: "Iteration signals",
      description:
        "These lights show the context Greenfield should expose while someone is editing a prompt.",
      items: [
        {
          id: "playground-ready",
          label: "Playground ready",
          missing:
            "Greenfield does not clearly state that this page is the prompt testing surface.",
          why: "Without this, the page reads like a mock editor instead of the place to test prompt changes.",
          placement: "Put this in the Iterate header or top status strip.",
          docs: [
            {
              label: "LLM Playground",
              href: "https://langfuse.com/docs/prompt-management/features/playground",
            },
          ],
        },
        {
          id: "real-run-replay",
          label: "Real run replay",
          missing:
            "Greenfield does not show a clear action to open a real production run in Iterate.",
          why: "Without this, users cannot easily fix a prompt against a real failure.",
          placement:
            "Put this as a primary action in the Iterate header and empty states.",
          docs: [
            {
              label: "LLM Playground",
              href: "https://langfuse.com/docs/prompt-management/features/playground",
            },
          ],
        },
        {
          id: "version-labels",
          label: "Version labels visible",
          missing:
            "Greenfield does not show which prompt version is being edited and which label is live.",
          why: "Without this, users cannot tell whether they are editing a draft or looking at the current live version.",
          placement: "Put this in the Iterate top bar beside the prompt name.",
          docs: [
            {
              label: "Prompt Version Control",
              href: "https://langfuse.com/docs/prompt-management/features/prompt-version-control",
            },
          ],
        },
        {
          id: "metrics-linked",
          label: "Metrics linked",
          missing:
            "Greenfield does not show whether this prompt version is connected to real quality, latency, and cost metrics.",
          why: "Without this, users do not know whether changes here will be measurable after release.",
          placement:
            "Put this in the Iterate right rail or top strip near version context.",
          docs: [
            {
              label: "Link Prompts to Traces",
              href: "https://langfuse.com/docs/prompt-management/features/link-to-traces",
            },
            {
              label: "Metrics",
              href: "https://langfuse.com/docs/metrics/overview",
            },
          ],
        },
      ],
    },
    evaluate: {
      title: "Evaluation signals",
      description:
        "These lights show the basic decision context Greenfield should expose before someone says a prompt is better.",
      items: [
        {
          id: "dataset-selected",
          label: "Dataset selected",
          missing:
            "Greenfield does not show which dataset this evaluation is using.",
          why: "Without this, users cannot trust what the result is actually based on.",
          placement: "Put this at the top of Evaluate in the setup summary.",
          docs: [
            {
              label: "Experiments via UI",
              href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-ui",
            },
          ],
        },
        {
          id: "judge-configured",
          label: "Judge configured",
          missing:
            "Greenfield does not show which evaluator is judging the prompt output.",
          why: "Without this, users cannot understand how the score was produced.",
          placement:
            "Put this in the Evaluate setup rail beside dataset selection.",
          docs: [
            {
              label: "LLM-as-a-Judge",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
            },
          ],
        },
        {
          id: "human-baseline",
          label: "Human baseline",
          missing:
            "Greenfield does not show whether human review exists to compare against automated scoring.",
          why: "Without this, users cannot tell if the evaluation has a human quality baseline.",
          placement:
            "Put this in the Evaluate results header or decision summary.",
          docs: [
            {
              label: "Manual Scores via UI",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-ui",
            },
            {
              label: "Annotation Queues",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues",
            },
          ],
        },
        {
          id: "score-analytics",
          label: "Score analytics",
          missing:
            "Greenfield does not show a clear path from this evaluation to score analysis.",
          why: "Without this, users cannot inspect why a candidate is better or worse over time.",
          placement:
            "Put this in the Evaluate results header as a secondary action or summary link.",
          docs: [
            {
              label: "Score Analytics",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/score-analytics",
            },
          ],
        },
      ],
    },
    deploy: {
      title: "Release signals",
      description:
        "These lights show the release context Greenfield should expose before someone promotes a prompt.",
      items: [
        {
          id: "live-label",
          label: "Live label set",
          missing:
            "Greenfield does not clearly show which prompt version is live right now.",
          why: "Without this, users cannot tell what they are replacing.",
          placement: "Put this in the Deploy release summary at the top.",
          docs: [
            {
              label: "Prompt Version Control",
              href: "https://langfuse.com/docs/prompt-management/features/prompt-version-control",
            },
          ],
        },
        {
          id: "rollback-ready",
          label: "Rollback ready",
          missing:
            "Greenfield does not show a clear rollback path from the current release view.",
          why: "Without this, users cannot tell how to recover if the new prompt fails.",
          placement:
            "Put this next to the main deploy action or in the release summary.",
          docs: [
            {
              label: "Prompt Version Control",
              href: "https://langfuse.com/docs/prompt-management/features/prompt-version-control",
            },
          ],
        },
        {
          id: "diff-available",
          label: "Diff available",
          missing:
            "Greenfield does not show what changed between the live prompt and the candidate.",
          why: "Without this, users cannot review the exact release delta before shipping.",
          placement:
            "Put this in the Deploy summary beside the candidate version.",
          docs: [
            {
              label: "Prompt Version Control",
              href: "https://langfuse.com/docs/prompt-management/features/prompt-version-control",
            },
          ],
        },
        {
          id: "experiment-backed",
          label: "Experiment-backed release",
          missing:
            "Greenfield does not show whether this release is backed by an experiment result.",
          why: "Without this, users cannot tell if the release is evidence-based or just manual judgment.",
          placement:
            "Put this in the Deploy gate summary above the primary release action.",
          docs: [
            {
              label: "Experiments via UI",
              href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-ui",
            },
            {
              label: "Prompt Version Control",
              href: "https://langfuse.com/docs/prompt-management/features/prompt-version-control",
            },
          ],
        },
        {
          id: "automation-hook",
          label: "Automation hook",
          missing:
            "Greenfield does not show what notification or automation happens after release.",
          why: "Without this, users do not know who gets informed or what system reacts to a prompt change.",
          placement:
            "Put this in a secondary Deploy panel under the main release controls.",
          docs: [
            {
              label: "Webhooks & Slack Integration",
              href: "https://langfuse.com/docs/prompt-management/features/webhooks-slack-integrations",
            },
          ],
        },
      ],
    },
    monitor: {
      title: "Monitoring signals",
      description:
        "These lights show the feedback-loop actions Greenfield should expose after a prompt is live.",
      items: [
        {
          id: "live-traces",
          label: "Live traces present",
          missing:
            "Greenfield does not clearly say whether this prompt is receiving live traffic right now.",
          why: "Without this, users cannot tell if Monitor is showing real production activity or not.",
          placement: "Put this in the Monitor top health strip.",
          docs: [
            {
              label: "Observability Overview",
              href: "https://langfuse.com/docs/observability/overview",
            },
          ],
        },
        {
          id: "prompt-metrics",
          label: "Prompt metrics present",
          missing:
            "Greenfield does not clearly show whether prompt-level quality, cost, and latency metrics are available.",
          why: "Without this, users cannot tell whether this prompt can be monitored at the version level.",
          placement:
            "Put this in the Monitor top health strip beside live traces.",
          docs: [
            {
              label: "Link Prompts to Traces",
              href: "https://langfuse.com/docs/prompt-management/features/link-to-traces",
            },
            {
              label: "Metrics",
              href: "https://langfuse.com/docs/metrics/overview",
            },
          ],
        },
        {
          id: "production-eval",
          label: "Production eval active",
          missing:
            "Greenfield does not show whether live production runs are being evaluated automatically.",
          why: "Without this, users cannot tell whether quality is being checked continuously after release.",
          placement:
            "Put this in the Monitor health strip and the call-detail header.",
          docs: [
            {
              label: "LLM-as-a-Judge",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
            },
          ],
        },
        {
          id: "human-review",
          label: "Send to human review",
          missing:
            "Greenfield does not expose a simple action to send a bad run to human review.",
          why: "Without this, users cannot turn a bad production case into a review task.",
          placement: "Put this in the Monitor call-detail action row.",
          docs: [
            {
              label: "Annotation Queues",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues",
            },
          ],
        },
        {
          id: "manual-score",
          label: "Manual score available",
          missing:
            "Greenfield does not expose a simple action to score a bad run manually.",
          why: "Without this, users cannot quickly add human judgment to a live example.",
          placement:
            "Put this in the Monitor call-detail action row next to human review.",
          docs: [
            {
              label: "Manual Scores via UI",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-ui",
            },
          ],
        },
        {
          id: "dataset-loop",
          label: "Add to dataset loop",
          missing:
            "Greenfield does not expose a simple action to turn a bad run into a dataset example.",
          why: "Without this, users cannot close the loop from live failure back into future evaluation.",
          placement:
            "Put this in the Monitor call-detail action row next to human review and manual score.",
          docs: [
            {
              label: "Datasets",
              href: "https://langfuse.com/docs/evaluation/experiments/overview",
            },
          ],
        },
      ],
    },
  };

export function GreenfieldDocSignals({
  section,
  className,
}: {
  section: GreenfieldDocSignalsSection;
  className?: string;
}) {
  const config = DOC_SIGNAL_SECTIONS[section];

  return (
    <section
      className={cn(
        "border-border/70 bg-background/95 border-b px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
            Langfuse signals
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold">{config.title}</h2>
            <span className="text-muted-foreground text-xs">
              Hover a light to see exactly what is missing.
            </span>
          </div>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm text-pretty">
            {config.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {config.items.map((item) => (
            <HoverCard key={item.id} openDelay={0}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  aria-label={`${item.label} indicator`}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 transition-colors hover:border-amber-300 hover:bg-amber-100/80"
                >
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inset-0 rounded-full bg-amber-400/55 blur-[1px]" />
                    <span className="relative size-2.5 rounded-full bg-amber-500" />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                className="w-[22rem] rounded-xl p-0"
              >
                <div className="p-4">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <div className="mt-3 space-y-3 text-sm leading-5">
                    <div>
                      <p className="text-[11px] font-medium tracking-[0.12em] uppercase">
                        Missing in Greenfield
                      </p>
                      <p className="text-muted-foreground mt-1 text-pretty">
                        {item.missing}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium tracking-[0.12em] uppercase">
                        Why this matters
                      </p>
                      <p className="text-muted-foreground mt-1 text-pretty">
                        {item.why}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium tracking-[0.12em] uppercase">
                        Put it here
                      </p>
                      <p className="text-muted-foreground mt-1 text-pretty">
                        {item.placement}
                      </p>
                    </div>
                  </div>

                  <div className="border-border/60 mt-4 border-t pt-3">
                    <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                      Documentation
                    </p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {item.docs.map((doc) => (
                        <a
                          key={doc.href}
                          href={doc.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                        >
                          {doc.label}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
      </div>
    </section>
  );
}

export type { GreenfieldDocSignalsSection };
