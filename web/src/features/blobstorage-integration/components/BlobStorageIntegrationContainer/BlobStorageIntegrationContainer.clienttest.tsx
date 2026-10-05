import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode } from "react";
import { BlobStorageIntegrationType } from "@langfuse/shared";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { BlobStorageIntegrationContainer } from "./BlobStorageIntegrationContainer";

const mocks = vi.hoisted(() => ({
  deleteMutateAsync: vi.fn(),
  invalidate: vi.fn(),
  mutate: vi.fn(),
  updateUseMutation: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/organizations", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true }),
}));

vi.mock("@/src/features/projects", () => ({
  useQueryProject: () => ({
    project: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
  }),
}));

vi.mock("@/src/utils/api", () => {
  const mutation = () => ({
    isPending: false,
    mutate: mocks.mutate,
    mutateAsync: vi.fn(),
  });

  return {
    api: {
      useUtils: () => ({
        blobStorageIntegration: { invalidate: mocks.invalidate },
      }),
      blobStorageIntegration: {
        update: {
          useMutation: (options: unknown) => {
            mocks.updateUseMutation(options);
            return mutation();
          },
        },
        delete: {
          useMutation: () => ({
            isPending: false,
            mutateAsync: mocks.deleteMutateAsync,
          }),
        },
        runNow: { useMutation: mutation },
        validate: { useMutation: mutation },
        testExternalMediaObject: { useMutation: mutation },
      },
    },
  };
});

vi.mock(
  "@/src/features/blobstorage-integration/components/BlobStorageIntegrationForm/BlobStorageIntegrationForm",
  () => ({
    BlobStorageIntegrationForm: ({
      deleteAction,
      scheduledExportActions,
      mediaStorageActions,
      onSubmit,
    }: {
      deleteAction: ReactNode;
      scheduledExportActions: ReactNode;
      mediaStorageActions: ReactNode;
      onSubmit: (values: Record<string, never>) => void;
    }) => (
      <>
        <button type="button" onClick={() => onSubmit({})}>
          Submit form
        </button>
        <div aria-label="Scheduled export actions">
          {scheduledExportActions}
        </div>
        <div aria-label="Media storage actions">{mediaStorageActions}</div>
        <div aria-label="Form actions">{deleteAction}</div>
      </>
    ),
  }),
);

const renderContainer = (
  config: Parameters<typeof BlobStorageIntegrationContainer>[0]["config"],
) =>
  render(
    <LayerProvider>
      <BlobStorageIntegrationContainer
        config={config}
        projectId="project-id"
        writeMode="events_only"
        showMediaStorage
        onDeleted={vi.fn()}
        onSaved={vi.fn()}
      />
    </LayerProvider>,
  );

describe("BlobStorageIntegrationContainer action explanations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["Test scheduled export upload", "Save the integration before testing."],
    ["Run now", "Save the integration before running an export."],
    ["Test external media object", "Save the integration before testing."],
  ])("explains why the unsaved %s action is disabled", async (name, reason) => {
    renderContainer(null);

    const button = screen.getByRole("button", { name });
    expect(button).toBeDisabled();

    const trigger = button.parentElement;
    expect(trigger).toHaveAttribute("tabindex", "0");
    fireEvent.focus(trigger!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(reason);
  });

  it("keeps action descriptions on saved, enabled integrations", () => {
    renderContainer({
      id: "integration-id",
      projectId: "project-id",
      type: BlobStorageIntegrationType.S3,
      enabled: true,
      mediaStorageEnabled: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(
      screen.getByRole("button", { name: "Test scheduled export upload" }),
    ).toHaveAttribute(
      "title",
      "Test your saved configuration by uploading a small test file to your storage",
    );
    expect(screen.getByRole("button", { name: "Run now" })).toHaveAttribute(
      "title",
      "Trigger an immediate export of all data since the last sync",
    );
    expect(
      screen.getByRole("button", { name: "Test external media object" }),
    ).toHaveAttribute("title", "Test an external media object");
  });

  it("refreshes integrations before navigating to a newly saved integration", async () => {
    let finishInvalidation: (() => void) | undefined;
    mocks.invalidate.mockReturnValue(
      new Promise<void>((resolve) => {
        finishInvalidation = resolve;
      }),
    );
    const onSaved = vi.fn();
    render(
      <LayerProvider>
        <BlobStorageIntegrationContainer
          config={null}
          projectId="project-id"
          writeMode="events_only"
          showMediaStorage
          onDeleted={vi.fn()}
          onSaved={onSaved}
        />
      </LayerProvider>,
    );
    const { onSuccess } = mocks.updateUseMutation.mock.calls[0][0] as {
      onSuccess: (integration: { id: string }) => Promise<void>;
    };

    const success = onSuccess({ id: "new-integration-id" });

    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();

    finishInvalidation?.();
    await success;

    expect(onSaved).toHaveBeenCalledWith("new-integration-id");
  });

  it("marks a new integration create explicitly", () => {
    renderContainer(null);

    fireEvent.click(screen.getByRole("button", { name: "Submit form" }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      projectId: "project-id",
      integrationId: null,
    });
  });

  it("only renders destructive delete with confirmation for a saved integration", async () => {
    const { rerender } = renderContainer(null);
    expect(
      screen.queryByRole("button", { name: "Delete integration" }),
    ).not.toBeInTheDocument();

    rerender(
      <LayerProvider>
        <BlobStorageIntegrationContainer
          config={{
            id: "integration-id",
            projectId: "project-id",
            type: BlobStorageIntegrationType.S3,
            enabled: true,
            mediaStorageEnabled: true,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }}
          projectId="project-id"
          writeMode="events_only"
          showMediaStorage
          onDeleted={vi.fn()}
          onSaved={vi.fn()}
        />
      </LayerProvider>,
    );

    const deleteButton = screen.getByRole("button", {
      name: "Delete integration",
    });
    expect(deleteButton).toHaveClass("bg-destructive");
    fireEvent.click(deleteButton);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Delete blob storage integration?"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete integration" }),
    );

    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith({
      projectId: "project-id",
      integrationId: "integration-id",
    });
  });
});
