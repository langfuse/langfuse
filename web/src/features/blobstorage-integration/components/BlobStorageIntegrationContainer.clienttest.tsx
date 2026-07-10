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
      onMutate?: (variables: { projectId: string }) => void;
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

  it("worker status write: updatedAt bump without config-field changes does NOT banner", () => {
    // Prisma @updatedAt bumps on every worker write (runStartedAt,
    // lastSyncAt, ...) while the 5s poll is active — must not read as drift.
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "my-draft" } });

    rerender(
      ui({
        config: savedConfig({
          updatedAt: new Date("2026-01-02T00:00:00Z"),
          lastSyncAt: new Date("2026-01-02T00:00:00Z"),
          runStartedAt: null,
        }),
      }),
    );

    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
    expect(bucketInput()).toHaveValue("my-draft"); // draft intact
  });

  it("drift banner: external config change shows the banner, keeps the draft, reload remounts", () => {
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

  it("own save: adoption rebaselines without a banner AND without remounting — post-Save typing survives", () => {
    const savedAt = new Date("2026-01-02T00:00:00Z");
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "self-saved-bucket" } });

    act(() => mutationOpts.update.onMutate?.({ projectId: "p1" }));
    act(() =>
      mutationOpts.update.onSuccess?.(
        savedConfig({ bucketName: "self-saved-bucket", updatedAt: savedAt }),
        { projectId: "p1" },
      ),
    );
    // User keeps typing between Save resolving and the refetch landing.
    fireEvent.change(bucketInput(), {
      target: { value: "self-saved-bucket-postsave-edit" },
    });
    rerender(
      ui({
        config: savedConfig({
          bucketName: "self-saved-bucket",
          updatedAt: savedAt,
        }),
      }),
    );

    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
    // No remount: the post-Save keystrokes are still in the field.
    expect(bucketInput()).toHaveValue("self-saved-bucket-postsave-edit");
  });

  it("own-save race: poll delivering the new updatedAt before onSuccess does not flash the banner", () => {
    const savedAt = new Date("2026-01-02T00:00:00Z");
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "racy-bucket" } });

    // Save request in flight; poll refetch lands first with the new row.
    act(() => mutationOpts.update.onMutate?.({ projectId: "p1" }));
    rerender(
      ui({
        config: savedConfig({ bucketName: "racy-bucket", updatedAt: savedAt }),
      }),
    );

    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument(); // no flash while in flight
    expect(bucketInput()).toHaveValue("racy-bucket"); // draft untouched

    // Mutation response arrives; its updatedAt and values match → adoption.
    act(() =>
      mutationOpts.update.onSuccess?.(
        savedConfig({ bucketName: "racy-bucket", updatedAt: savedAt }),
        { projectId: "p1" },
      ),
    );
    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
    expect(bucketInput()).toHaveValue("racy-bucket");
  });

  it("own save + worker bump: refetch with a LATER updatedAt still adopts silently", () => {
    // Worker status writes can bump the row again between the save and its
    // refetch; adoption is >= the expected updatedAt, so the user's own
    // save never turns into a drift banner.
    const savedAt = new Date("2026-01-02T00:00:00Z");
    const workerBumpAt = new Date("2026-01-02T00:00:05Z");
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "self-saved-bucket" } });

    act(() => mutationOpts.update.onMutate?.({ projectId: "p1" }));
    act(() =>
      mutationOpts.update.onSuccess?.(
        savedConfig({ bucketName: "self-saved-bucket", updatedAt: savedAt }),
        { projectId: "p1" },
      ),
    );
    rerender(
      ui({
        config: savedConfig({
          bucketName: "self-saved-bucket",
          updatedAt: workerBumpAt,
          runStartedAt: new Date("2026-01-02T00:00:05Z"),
        }),
      }),
    );

    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
    expect(bucketInput()).toHaveValue("self-saved-bucket");
  });

  it("pre-save drift arriving after save success still banners (not adopted)", () => {
    // Drift existed before the user saved; the drifted row (older
    // updatedAt than the save) lands after onSuccess. It must not be
    // silently adopted as the user's own save.
    const driftAt = new Date("2026-01-01T12:00:00Z"); // before savedAt
    const savedAt = new Date("2026-01-02T00:00:00Z");
    const { rerender } = render(ui({ config: savedConfig() }));

    act(() => mutationOpts.update.onMutate?.({ projectId: "p1" }));
    act(() =>
      mutationOpts.update.onSuccess?.(savedConfig({ updatedAt: savedAt }), {
        projectId: "p1",
      }),
    );

    fireEvent.change(bucketInput(), { target: { value: "my-draft" } });
    rerender(
      ui({
        config: savedConfig({
          bucketName: "changed-elsewhere",
          updatedAt: driftAt,
        }),
      }),
    );

    expect(
      screen.getByText("Configuration changed elsewhere"),
    ).toBeInTheDocument(); // still banners
    expect(bucketInput()).toHaveValue("my-draft"); // draft intact
  });

  it("first visit: availability resolving after the loading render does not banner", () => {
    // While the query loads, the page passes isEnrichedExportAvailable=false
    // (the ?? false fallback); once resolved it may flip to true, changing
    // the exportSource default for a never-configured project. That
    // transition must rebaseline, not read as drift.
    const { rerender } = render(
      ui({ isLoading: true, config: null, isEnrichedExportAvailable: false }),
    );
    rerender(
      ui({ isLoading: false, config: null, isEnrichedExportAvailable: true }),
    );

    expect(
      screen.queryByText("Configuration changed elsewhere"),
    ).not.toBeInTheDocument();
    expect(bucketInput()).toHaveValue(""); // blank new-config form
  });

  it("concurrent save landing inside the save→refetch window still banners", () => {
    // User B's save reaches the server after A's save but before A's
    // post-save refetch: the refetch carries B's values with a LATER
    // updatedAt. Timestamp alone would adopt it silently; the value check
    // must keep the banner.
    const savedAt = new Date("2026-01-02T00:00:00Z");
    const userBAt = new Date("2026-01-02T00:00:03Z");
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "user-a-bucket" } });

    act(() => mutationOpts.update.onMutate?.({ projectId: "p1" }));
    act(() =>
      mutationOpts.update.onSuccess?.(
        savedConfig({ bucketName: "user-a-bucket", updatedAt: savedAt }),
        { projectId: "p1" },
      ),
    );
    rerender(
      ui({
        config: savedConfig({
          bucketName: "user-b-bucket",
          updatedAt: userBAt,
        }),
      }),
    );

    expect(
      screen.getByText("Configuration changed elsewhere"),
    ).toBeInTheDocument();
    expect(bucketInput()).toHaveValue("user-a-bucket"); // draft intact
  });

  it("reload clears the own-save expectation: a later external revert banners instead of adopting", () => {
    // A saves V1; B's V2 lands inside A's save→refetch window → banner.
    // A clicks Reload (acknowledging V2) and edits a fresh draft. B then
    // reverts to V1 with a later updatedAt — matching A's stale
    // expectation. It must banner, not silently adopt over A's new draft.
    const savedAt = new Date("2026-01-02T00:00:00Z");
    const userBAt = new Date("2026-01-02T00:00:03Z");
    const revertAt = new Date("2026-01-02T00:05:00Z");
    const { rerender } = render(ui({ config: savedConfig() }));
    fireEvent.change(bucketInput(), { target: { value: "user-a-bucket" } });

    act(() => mutationOpts.update.onMutate?.({ projectId: "p1" }));
    act(() =>
      mutationOpts.update.onSuccess?.(
        savedConfig({ bucketName: "user-a-bucket", updatedAt: savedAt }),
        { projectId: "p1" },
      ),
    );
    rerender(
      ui({
        config: savedConfig({
          bucketName: "user-b-bucket",
          updatedAt: userBAt,
        }),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload form (discards unsaved edits)",
      }),
    );
    expect(bucketInput()).toHaveValue("user-b-bucket"); // reloaded to B's row
    fireEvent.change(bucketInput(), {
      target: { value: "post-reload-draft" },
    });

    // B reverts to exactly A's earlier values, later timestamp.
    rerender(
      ui({
        config: savedConfig({
          bucketName: "user-a-bucket",
          updatedAt: revertAt,
        }),
      }),
    );

    expect(
      screen.getByText("Configuration changed elsewhere"),
    ).toBeInTheDocument(); // not silently adopted
    expect(bucketInput()).toHaveValue("post-reload-draft"); // draft intact
  });
});
