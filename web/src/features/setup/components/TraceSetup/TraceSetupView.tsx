"use client";

import { GetStartedRow } from "./components/GetStartedRow/GetStartedRow";
import { JobsGrid } from "./components/JobsGrid/JobsGrid";
import { SetupStepper } from "./components/SetupStepper/SetupStepper";
import { StepHeader } from "./components/StepHeader/StepHeader";
import type { SetupProject, TraceSetupActions, TraceSetupModel } from "./types";

/** Where each step sits on the stepper: the demo chat is still the way in; a first trace completes all three. */
const STEPPER_POSITION = {
  wayIn: 1,
  demo: 1,
  setup: 2,
  traceIn: 4,
} as const;

type TraceSetupViewProps = {
  /** The page's state, as `useTraceSetup` keeps it. */
  model: TraceSetupModel;
  project: SetupProject;
  actions: TraceSetupActions;
};

/**
 * The first-trace page of a new project, one decision at a time: pick what to trace (an app or a coding agent, or a
 * demo chat first), set it up while the card listens, then follow the next step to a set-up project. Changes made in
 * front of you animate; the state the page opens in doesn't.
 */
export function TraceSetupView({
  model,
  project,
  actions,
}: TraceSetupViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-9 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <StepHeader
          setup={model.setup}
          shouldRescueFocus={model.shouldAnimate}
        />
        <SetupStepper
          current={STEPPER_POSITION[model.setup.step]}
          shouldAnimate={model.shouldAnimate}
        />
      </header>
      <GetStartedRow model={model} project={project} actions={actions} />
      <JobsGrid
        setup={model.setup}
        projectId={project.id}
        shouldAnimate={model.shouldAnimate}
      />
    </div>
  );
}
