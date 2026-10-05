import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
  LEGACY_EXPORT_PROJECT_CUTOFF,
  type BlobStorageIntegration,
  type ExportSourceContext,
} from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { BlobStorageIntegrationForm } from "./BlobStorageIntegrationForm";
import {
  buildBlobStorageFormValues,
  type BlobStorageFormValues,
} from "./formValues";

// EVENTS-only context (post-cutoff Cloud project, new row): single selectable
// source, selector hidden — keeps the rendered tree small and the submit
// payload valid.
const exportSourceCtx: ExportSourceContext = {
  isCloud: true,
  enrichedAvailable: true,
  legacyWritesActive: true,
  projectCreatedAt: new Date(LEGACY_EXPORT_PROJECT_CUTOFF.getTime() + 1),
  integrationCreatedAt: null,
};

const savedConfig: Partial<BlobStorageIntegration> = {
  type: BlobStorageIntegrationType.S3,
  bucketName: "seed-bucket",
  region: "us-east-1",
  accessKeyId: "AKIA-SEED",
  prefix: "exports/",
  mediaPrefix: "media/",
  fileType: BlobStorageIntegrationFileType.JSONL,
  enabled: true,
};

const ui = (
  key: string,
  initialValues: BlobStorageFormValues,
  onSubmit: (values: unknown) => void = () => {},
  showMediaStorage = false,
  actions: {
    deleteAction?: ReactNode;
    mediaStorageActions?: ReactNode;
    scheduledExportActions?: ReactNode;
  } = {},
) => (
  <TooltipProvider>
    <BlobStorageIntegrationForm
      key={key}
      initialValues={initialValues}
      exportSourceCtx={exportSourceCtx}
      persistedExportSource={null}
      isSaving={false}
      showMediaStorage={showMediaStorage}
      onSubmit={onSubmit}
      deleteAction={actions.deleteAction ?? null}
      mediaStorageActions={actions.mediaStorageActions ?? null}
      scheduledExportActions={actions.scheduledExportActions ?? null}
    />
  </TooltipProvider>
);

const bucketInput = () =>
  screen.getByLabelText("Bucket Name") as HTMLInputElement;

describe("BlobStorageIntegrationForm draft lifetime (keyed remount)", () => {
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

  it("delete flow: dirty configured form + key flip to 'new' renders blank defaults", () => {
    const { rerender } = render(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(savedConfig, exportSourceCtx),
      ),
    );
    fireEvent.change(bucketInput(), { target: { value: "edited-bucket" } });
    expect(bucketInput()).toHaveValue("edited-bucket");

    // Container behavior after delete: config becomes null → key flips.
    rerender(
      ui("p1:new", buildBlobStorageFormValues(undefined, exportSourceCtx)),
    );

    expect(bucketInput()).toHaveValue("");
    expect(screen.getByLabelText("Region")).toHaveValue("auto");
  });

  it("project switch: key change discards unsaved input from the previous project", () => {
    const { rerender } = render(
      ui("p1:new", buildBlobStorageFormValues(undefined, exportSourceCtx)),
    );
    fireEvent.change(bucketInput(), {
      target: { value: "project-a-secret-bucket" },
    });
    fireEvent.change(screen.getByLabelText(/Access Key ID/), {
      target: { value: "AKIA-PROJECT-A" },
    });

    rerender(
      ui("p2:new", buildBlobStorageFormValues(undefined, exportSourceCtx)),
    );

    expect(bucketInput()).toHaveValue("");
    expect(screen.getByLabelText(/Access Key ID/)).toHaveValue("");
  });

  it("post-create: key flip to 'configured' initializes from the saved config", () => {
    const { rerender } = render(
      ui("p1:new", buildBlobStorageFormValues(undefined, exportSourceCtx)),
    );
    fireEvent.change(bucketInput(), { target: { value: "typed-before-save" } });

    rerender(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(savedConfig, exportSourceCtx),
      ),
    );

    expect(bucketInput()).toHaveValue("seed-bucket");
    expect(screen.getByLabelText("Region")).toHaveValue("us-east-1");
  });

  it("same key: rerender with new initialValues does NOT touch the mounted draft", () => {
    // Container behavior during the 5s status poll: same entity refetches
    // keep the key stable, so a draft in progress is never wiped.
    const { rerender } = render(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(savedConfig, exportSourceCtx),
      ),
    );
    fireEvent.change(bucketInput(), { target: { value: "mid-save-typing" } });

    rerender(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(
          { ...savedConfig, bucketName: "refetched-bucket" },
          exportSourceCtx,
        ),
      ),
    );

    expect(bucketInput()).toHaveValue("mid-save-typing");
  });

  it("submit passes the draft values through unchanged", async () => {
    const onSubmit = vi.fn();
    render(
      ui(
        "p1:new",
        buildBlobStorageFormValues(undefined, exportSourceCtx),
        onSubmit,
      ),
    );
    fireEvent.change(bucketInput(), { target: { value: "my-new-bucket" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BlobStorageIntegrationType.S3,
        bucketName: "my-new-bucket",
        region: "auto",
        exportFrequency: "daily",
        fileType: BlobStorageIntegrationFileType.PARQUET,
        enabled: true,
      }),
      expect.anything(),
    );
  });

  it("expands and collapses scheduled export settings with the enable switch", () => {
    render(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(savedConfig, exportSourceCtx),
      ),
    );

    const exportsSwitch = screen.getByRole("switch", {
      name: "Scheduled exports",
    });
    expect(exportsSwitch).toBeChecked();
    expect(screen.getByLabelText("Export Frequency")).toBeVisible();
    expect(screen.getByLabelText("Export Prefix")).toHaveValue("exports/");

    fireEvent.click(exportsSwitch);

    expect(exportsSwitch).not.toBeChecked();
    expect(screen.queryByLabelText("Export Frequency")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Export Prefix")).not.toBeInTheDocument();
  });

  it("allows external media without a media prefix when the feature-gated section is shown", async () => {
    const initialValues = buildBlobStorageFormValues(
      { ...savedConfig, mediaPrefix: null },
      exportSourceCtx,
    );
    const { rerender } = render(ui("hidden", initialValues));

    expect(screen.queryByText("External media")).not.toBeInTheDocument();

    const onSubmit = vi.fn();
    rerender(ui("visible", initialValues, onSubmit, true));
    fireEvent.click(
      screen.getByRole("switch", { name: "External media storage" }),
    );
    expect(screen.getByLabelText("Media prefix (optional)")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaStorageEnabled: true,
        mediaPrefix: "",
      }),
      expect.anything(),
    );
  });

  it("allows Azure exports but disables Azure external media", () => {
    const initialValues = buildBlobStorageFormValues(
      {
        ...savedConfig,
        type: BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
        enabled: false,
        mediaStorageEnabled: false,
      },
      exportSourceCtx,
    );
    render(ui("azure", initialValues, undefined, true));

    expect(
      screen.getByRole("switch", { name: "Scheduled exports" }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "External media storage" }),
    ).toBeDisabled();
  });

  it("turns off external media when the provider changes to Azure", async () => {
    const onSubmit = vi.fn();
    const initialValues = buildBlobStorageFormValues(
      {
        ...savedConfig,
        mediaStorageEnabled: true,
      },
      exportSourceCtx,
    );
    render(ui("provider-change", initialValues, onSubmit, true));

    expect(
      screen.getByRole("switch", { name: "External media storage" }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("combobox", { name: "Storage Provider" }));
    fireEvent.click(screen.getByRole("option", { name: "Azure Blob Storage" }));

    expect(
      screen.getByRole("switch", { name: "External media storage" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Scheduled exports" }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
        enabled: true,
        mediaStorageEnabled: false,
        mediaPrefix: "media/",
      }),
      expect.anything(),
    );
  });

  it("shows section actions only while enabled and places delete before save", () => {
    const initialValues = buildBlobStorageFormValues(
      {
        ...savedConfig,
        mediaStorageEnabled: true,
      },
      exportSourceCtx,
    );
    render(
      ui("actions", initialValues, undefined, true, {
        deleteAction: <button type="button">Delete integration</button>,
        mediaStorageActions: (
          <button type="button" aria-label="Test external media object">
            Test
          </button>
        ),
        scheduledExportActions: (
          <>
            <button type="button" aria-label="Test scheduled export upload">
              Test
            </button>
            <button type="button">Run now</button>
          </>
        ),
      }),
    );

    expect(
      screen.getByRole("button", { name: "Test scheduled export upload" }),
    ).toHaveTextContent("Test");
    expect(screen.getByRole("button", { name: "Run now" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Test external media object" }),
    ).toHaveTextContent("Test");
    const deleteButton = screen.getByRole("button", {
      name: "Delete integration",
    });
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(deleteButton).toBeVisible();
    expect(saveButton.parentElement).toHaveClass("justify-end", "gap-2");
    expect(saveButton.previousElementSibling).toBe(deleteButton);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Scheduled exports" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "External media storage" }),
    );

    expect(
      screen.queryByRole("button", { name: "Test scheduled export upload" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Test external media object" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete integration" }),
    ).toBeVisible();
  });
});
