import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
  type BlobStorageIntegration,
} from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const { mutationOpts } = vi.hoisted(() => ({
  mutationOpts: {} as Record<
    string,
    {
      onSuccess?: (data: unknown, variables: { projectId: string }) => void;
      onError?: (error: unknown, variables: { projectId: string }) => void;
    }
  >,
}));

vi.mock("@/src/utils/api", () => {
  const makeUseMutation =
    (name: string) => (opts: (typeof mutationOpts)[string]) => {
      mutationOpts[name] = opts;
      return { mutate: vi.fn(), isPending: false };
    };
  return {
    api: {
      useUtils: () => ({ blobStorageIntegration: { invalidate: vi.fn() } }),
      blobStorageIntegration: {
        update: { useMutation: makeUseMutation("update") },
        delete: { useMutation: makeUseMutation("delete") },
        runNow: { useMutation: makeUseMutation("runNow") },
        validate: { useMutation: makeUseMutation("validate") },
      },
    },
  };
});

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));
vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: vi.fn(),
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({
    project: { id: "p1", createdAt: new Date("2024-01-01T00:00:00Z") },
  }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { BlobStorageIntegrationContainer } from "./BlobStorageIntegrationContainer";

const savedConfig = (
  overrides: Partial<BlobStorageIntegration> = {},
): Partial<BlobStorageIntegration> => ({
  type: BlobStorageIntegrationType.S3,
  bucketName: "saved-bucket",
  region: "us-east-1",
  fileType: BlobStorageIntegrationFileType.PARQUET,
  enabled: true,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

type ContainerProps = Parameters<typeof BlobStorageIntegrationContainer>[0];

const ui = (props: Partial<ContainerProps> = {}) => (
  <TooltipProvider>
    <BlobStorageIntegrationContainer
      projectId="p1"
      config={null}
      isLoading={false}
      isEnrichedExportAvailable={true}
      {...props}
    />
  </TooltipProvider>
);

const bucketInput = () =>
  screen.getByLabelText("Bucket Name") as HTMLInputElement;

describe("BlobStorageIntegrationContainer", () => {
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
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    vi.mocked(showSuccessToast).mockClear();
  });

  it("loading gate: form is not mounted while the query is loading", () => {
    render(ui({ isLoading: true }));
    expect(screen.queryByText("Storage Provider")).not.toBeInTheDocument();
  });

  it("delete flow: dirty form remounts blank when config becomes null", () => {
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "edited-bucket" } });

    rerender(ui({ config: null }));

    expect(bucketInput()).toHaveValue("");
  });

  it("project switch: no value carryover across projectId change", () => {
    const { rerender } = render(ui({ projectId: "p1" }));
    fireEvent.change(bucketInput(), { target: { value: "project-a-draft" } });

    rerender(ui({ projectId: "p2" }));

    expect(bucketInput()).toHaveValue("");
  });

  it("post-create: new → configured remounts initialized from the saved config", () => {
    const { rerender } = render(ui({ config: null }));
    fireEvent.change(bucketInput(), { target: { value: "typed-before-save" } });

    rerender(ui({ config: savedConfig() }));

    expect(bucketInput()).toHaveValue("saved-bucket");
  });

  it("stale mutation guard: validate resolving after a project switch does not toast", () => {
    const { rerender } = render(ui({ projectId: "p1" }));

    act(() =>
      mutationOpts.validate.onSuccess?.(
        { message: "ok", testFileName: "f1" },
        { projectId: "p1" },
      ),
    );
    expect(showSuccessToast).toHaveBeenCalledTimes(1);

    rerender(ui({ projectId: "p2" }));
    act(() =>
      mutationOpts.validate.onSuccess?.(
        { message: "ok", testFileName: "f2" },
        { projectId: "p1" },
      ),
    );
    expect(showSuccessToast).toHaveBeenCalledTimes(1); // no second toast
  });

  it("drift banner: external updatedAt change shows the banner, keeps the draft, reload remounts", () => {
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "my-draft" } });

    rerender(
      ui({
        config: savedConfig({
          bucketName: "changed-elsewhere",
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        }),
      }),
    );

    expect(
      screen.getByText("Configuration changed elsewhere"),
    ).toBeInTheDocument();
    expect(bucketInput()).toHaveValue("my-draft"); // draft intact

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload form (discards unsaved edits)",
      }),
    );

    expect(bucketInput()).toHaveValue("changed-elsewhere");
    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
  });

  it("own save: updatedAt bump after update success remounts without a banner", () => {
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "self-saved-bucket" } });

    act(() => mutationOpts.update.onSuccess?.({}, { projectId: "p1" }));
    rerender(
      ui({
        config: savedConfig({
          bucketName: "self-saved-bucket",
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        }),
      }),
    );

    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
    expect(bucketInput()).toHaveValue("self-saved-bucket"); // remounted from saved row
  });
});
