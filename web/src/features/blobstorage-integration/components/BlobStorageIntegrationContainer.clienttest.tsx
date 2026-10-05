import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { BlobStorageIntegrationType } from "@langfuse/shared";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { BlobStorageIntegrationContainer } from "./BlobStorageIntegrationContainer";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
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
        blobStorageIntegration: { invalidate: vi.fn() },
      }),
      blobStorageIntegration: {
        update: { useMutation: mutation },
        delete: { useMutation: mutation },
        runNow: { useMutation: mutation },
        validate: { useMutation: mutation },
        testExternalMediaObject: { useMutation: mutation },
      },
    },
  };
});

vi.mock("./BlobStorageIntegrationForm", () => ({
  BlobStorageIntegrationForm: ({
    scheduledExportActions,
    mediaStorageActions,
  }: {
    scheduledExportActions: ReactNode;
    mediaStorageActions: ReactNode;
  }) => (
    <>
      <div aria-label="Scheduled export actions">{scheduledExportActions}</div>
      <div aria-label="Media storage actions">{mediaStorageActions}</div>
    </>
  ),
}));

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
});
