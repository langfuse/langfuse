import { type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";

const mocks = vi.hoisted(() => ({
  allDatasetMetaUseQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: {
        useQuery: (...args: unknown[]) => mocks.allDatasetMetaUseQuery(...args),
      },
    },
  },
}));

import { RemoteExperimentDatasetStep } from "./RemoteExperimentDatasetStep";

const renderStep = (
  props: Partial<ComponentProps<typeof RemoteExperimentDatasetStep>> = {},
) =>
  render(
    <Dialog open>
      <DialogContent>
        <RemoteExperimentDatasetStep
          projectId="project-1"
          onBack={vi.fn()}
          onContinue={vi.fn()}
          {...props}
        />
      </DialogContent>
    </Dialog>,
  );

describe("RemoteExperimentDatasetStep", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    mocks.allDatasetMetaUseQuery.mockReset();
  });

  it("requires a dataset before continuing", async () => {
    const onContinue = vi.fn();

    mocks.allDatasetMetaUseQuery.mockReturnValue({
      data: [
        { id: "dataset-1", name: "First dataset" },
        { id: "dataset-2", name: "Remote experiment dataset" },
      ],
      isFetching: false,
      isPending: false,
    });

    renderStep({ onContinue });

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Remote experiment dataset"));

    expect(screen.getByRole("combobox")).toHaveTextContent(
      "Remote experiment dataset",
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(onContinue).toHaveBeenCalledWith({
      id: "dataset-2",
      name: "Remote experiment dataset",
    });
  });

  it("shows an empty state when no datasets exist", () => {
    mocks.allDatasetMetaUseQuery.mockReturnValue({
      data: [],
      isFetching: false,
      isPending: false,
    });

    renderStep();

    expect(screen.getByText("No datasets found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
