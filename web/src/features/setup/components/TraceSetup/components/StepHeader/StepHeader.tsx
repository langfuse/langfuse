import { codingAgentOf } from "../../codingAgents";
import { agentOf, firstTraceTitle } from "../../firstTrace";
import type { TraceSetupState } from "../../types";

type StepHeaderProps = {
  setup: TraceSetupState;
  /** The step changed in front of you: the new title takes focus if what had it is gone, so you keep your place. */
  shouldRescueFocus: boolean;
};

/** Takes focus only when nothing has it, e.g. the button just pressed went with the old step. */
function rescueFocus(heading: HTMLHeadingElement | null) {
  if (heading && document.activeElement === document.body)
    heading.focus({ preventScroll: true });
}

function copyFor(setup: TraceSetupState) {
  if (setup.step === "wayIn")
    return {
      title: "Let's see inside your AI",
      lead: "Pick what to trace first. Your first trace takes about a minute.",
    };
  if (setup.step === "demo")
    return {
      title: "Try it with a demo chat",
      lead: "Ask the demo app something and watch its trace build, step by step.",
    };
  if (setup.step === "traceIn")
    return {
      title: firstTraceTitle(setup.trace),
      lead: agentOf(setup.trace)
        ? "Every prompt, file read and command, step by step."
        : "Langfuse caught it. This is what your app did, step by step.",
    };
  const agent =
    setup.way.kind === "agent" ? codingAgentOf(setup.way.slug) : undefined;
  return agent
    ? {
        title: `Trace your ${agent.name} sessions`,
        lead: "Install its plugin and start a session. Its first turn shows up here.",
      }
    : {
        title: "Add tracing to your app",
        lead: "Two pastes and one run, then every LLM call shows up here.",
      };
}

/** The page's heading: where the project is on the way to its first trace, in a title and one line. */
export function StepHeader({ setup, shouldRescueFocus }: StepHeaderProps) {
  const { title, lead } = copyFor(setup);
  return (
    <div className="flex flex-col gap-2">
      <h1
        key={title}
        ref={shouldRescueFocus ? rescueFocus : undefined}
        tabIndex={-1}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-bold tracking-tight outline-hidden"
      >
        {title}
      </h1>
      <p className="text-muted-foreground max-w-xl">{lead}</p>
    </div>
  );
}
