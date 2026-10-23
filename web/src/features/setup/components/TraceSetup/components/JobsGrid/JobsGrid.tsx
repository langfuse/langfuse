import type { ComponentProps } from "react";
import type { TraceSetupState } from "../../types";
import { JobCard } from "../JobCard/JobCard";

/** The four jobs before a first trace: the ones a trace unlocks wait for it. */
const FIRST_JOBS = [
  {
    title: "Find why an answer broke",
    description: "Open a trace, see every step, and spot the one that failed.",
    drawing: "failedSpan",
    action: { text: "Open traces", path: "traces" },
    needsTrace: true,
  },
  {
    title: "Watch cost and quality",
    description:
      "See spend, speed and scores over time, and hear when they slip.",
    drawing: "metrics",
    action: { text: "New dashboard", path: "dashboards/new" },
    needsTrace: true,
  },
  {
    title: "Improve a prompt",
    description:
      "Change it, try it in the playground, and roll it out, or back.",
    drawing: "prompts",
    action: { text: "New prompt", path: "prompts/new" },
    needsTrace: false,
  },
  {
    title: "Test a change before it ships",
    description:
      "Run the new version on your own cases and compare it with what's live.",
    drawing: "datasetRuns",
    action: { text: "New dataset", path: "datasets" },
    needsTrace: false,
  },
] as const;

type Job = Pick<
  ComponentProps<typeof JobCard>,
  "title" | "description" | "drawing" | "action"
> & { needsTrace: boolean };

/**
 * The four jobs below, by where the project is: before a first trace the general ones; after it, jobs that work on
 * what came in. An app trace points at this trace, a coding agent's turn at its session.
 */
function jobsFor(setup: TraceSetupState, projectId: string): Job[] {
  const path = (to: string) => `/project/${projectId}/${to}`;
  if (setup.step !== "traceIn")
    return FIRST_JOBS.map(({ action, ...job }) => ({
      ...job,
      action: { text: action.text, href: path(action.path) },
    }));
  const { trace } = setup;
  const watch: Job = {
    title: "Watch cost and quality",
    description:
      "See spend, speed and scores over time, and hear when they slip.",
    drawing: "metrics",
    action: { text: "New dashboard", href: path("dashboards/new") },
    needsTrace: true,
  };
  if (trace.source.kind === "agent")
    return [
      {
        title: "See the whole session",
        description:
          "Every turn of the conversation in order, with what each one cost.",
        drawing: "sessions",
        action: { text: "See every turn", href: trace.source.sessionHref },
        needsTrace: true,
      },
      {
        title: "Cost per session",
        description:
          "See what your agent spends per session, per model and per tool.",
        drawing: "metrics",
        action: { text: "New dashboard", href: path("dashboards/new") },
        needsTrace: true,
      },
      {
        title: "Score your turns",
        description: "Have a judge check whether each turn did what you asked.",
        drawing: "evaluators",
        action: { text: "New evaluator", href: path("evals/new") },
        needsTrace: true,
      },
      {
        title: "Find a turn that went wrong",
        description:
          "Filter turns by errors, length or cost, and open the one that stands out.",
        drawing: "failedSpan",
        action: { text: "Open traces", href: path("traces") },
        needsTrace: true,
      },
    ];
  return [
    {
      title: "Find why an answer broke",
      description:
        "Open this trace, see every step, and spot the one that failed.",
      drawing: "failedSpan",
      action: { text: "Open this trace", href: trace.href },
      needsTrace: true,
    },
    {
      title: "Add it to a dataset",
      description:
        "Keep this trace as a test case, then rerun it on every change.",
      drawing: "datasetRuns",
      action: { text: "Open it to add", href: trace.href },
      needsTrace: true,
    },
    {
      title: "Try its prompt in the playground",
      description:
        "Open its LLM call, tweak the prompt and compare the answers.",
      drawing: "prompts",
      action: { text: "Open its LLM call", href: trace.href },
      needsTrace: true,
    },
    watch,
  ];
}

/** What else the project can do, below the setup: jobs that need a trace wait for the first one, then open. */
export function JobsGrid({
  setup,
  projectId,
  shouldAnimate,
}: {
  setup: TraceSetupState;
  projectId: string;
  /** The page moved on in front of you, so jobs the first trace opens lift as it lands. */
  shouldAnimate: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-muted-foreground shrink-0 text-sm font-bold">
          What else you can do
        </h2>
        <span aria-hidden="true" className="flex-1 border-t" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {jobsFor(setup, projectId).map((job) => (
          <JobCard
            key={job.title}
            title={job.title}
            description={job.description}
            drawing={job.drawing}
            action={job.action}
            isLocked={job.needsTrace && setup.step !== "traceIn"}
            isUnlocking={setup.step === "traceIn" && shouldAnimate}
          />
        ))}
      </div>
    </section>
  );
}
