import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Mock } from "vitest";

import { api } from "@/src/utils/api";
import { CreateExperimentsForm } from "./CreateExperimentsForm";

// The remote-experiment query is the only tRPC call this component makes.
vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      getRemoteExperiment: {
        useQuery: vi.fn(),
      },
    },
  },
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

// Radix Dialog primitives need a Dialog context; replace them with plain
// elements so we can render the form standalone.
vi.mock("@/src/components/ui/dialog", () => ({
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href?: string | { pathname?: string };
  }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

// Stub the heavy sub-forms so we can assert which one the form routes to.
vi.mock(
  "@/src/features/experiments/components/MultiStepExperimentForm",
  () => ({
    MultiStepExperimentForm: () => (
      <div data-testid="multi-step-experiment-form" />
    ),
  }),
);

vi.mock(
  "@/src/features/experiments/components/RemoteExperimentUpsertForm",
  () => ({
    RemoteExperimentUpsertForm: () => (
      <div data-testid="remote-experiment-upsert-form" />
    ),
  }),
);

vi.mock(
  "@/src/features/experiments/components/RemoteExperimentTriggerModal",
  () => ({
    RemoteExperimentTriggerModal: () => (
      <div data-testid="remote-experiment-trigger-modal" />
    ),
  }),
);

const mockedUseQuery = api.datasets.getRemoteExperiment
  .useQuery as unknown as Mock;

const PROJECT_ID = "project-1";
const DATASET_ID = "dataset-1";
const SETUP_BUTTON_TITLE = "Set up remote dataset run in UI trigger";

function renderForm(
  props: Partial<React.ComponentProps<typeof CreateExperimentsForm>> = {},
) {
  return render(
    <CreateExperimentsForm
      projectId={PROJECT_ID}
      setFormOpen={() => {}}
      showSDKRunInfoPage
      {...props}
    />,
  );
}

describe("CreateExperimentsForm – SDK/API info page", () => {
  afterEach(() => {
    mockedUseQuery.mockReset();
  });

  it("does not render the remote-trigger setup button when there is no dataset in context", () => {
    // Without a datasetId the query is disabled and returns no data.
    mockedUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    renderForm(); // no defaultValues -> datasetId is undefined

    // The info page is shown...
    expect(screen.getByText("Run Experiment")).toBeInTheDocument();
    expect(screen.getByText("via SDK / API")).toBeInTheDocument();

    // ...but the remote-run setup (Zap) button must not be offered, because a
    // remote experiment is dataset-scoped and clicking it would otherwise fall
    // through to the UI experiment form (the wrong window).
    expect(screen.queryByTitle(SETUP_BUTTON_TITLE)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("multi-step-experiment-form"),
    ).not.toBeInTheDocument();
  });

  it("opens the remote-experiment upsert form (not the UI experiment form) when the setup button is clicked with a dataset", () => {
    mockedUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    renderForm({ defaultValues: { datasetId: DATASET_ID } });

    const setupButton = screen.getByTitle(SETUP_BUTTON_TITLE);
    fireEvent.click(setupButton);

    expect(
      screen.getByTestId("remote-experiment-upsert-form"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("multi-step-experiment-form"),
    ).not.toBeInTheDocument();
  });
});
