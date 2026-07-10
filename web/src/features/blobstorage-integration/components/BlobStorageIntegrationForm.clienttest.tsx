import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  AnalyticsIntegrationExportSource,
  BlobStorageExportMode,
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
  type BlobStorageIntegration,
} from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { BlobStorageIntegrationForm } from "./BlobStorageIntegrationForm";
import {
  buildBlobStorageFormValues,
  type BlobStorageFormValues,
} from "./formValues";
import { type ExportSourceAvailability } from "@/src/features/blobstorage-integration/exportSource";

// EVENTS-only deployment: single selectable source, selector hidden —
// keeps the rendered tree small and the submit payload valid.
const availability: ExportSourceAvailability = {
  eventsExportAvailable: true,
  forceEventsExport: true,
};

const savedConfig: Partial<BlobStorageIntegration> = {
  type: BlobStorageIntegrationType.S3,
  bucketName: "seed-bucket",
  region: "us-east-1",
  accessKeyId: "AKIA-SEED",
  fileType: BlobStorageIntegrationFileType.JSONL,
  enabled: true,
};

const ui = (
  key: string,
  initialValues: BlobStorageFormValues,
  onSubmit: (values: unknown) => void = () => {},
) => (
  <TooltipProvider>
    <BlobStorageIntegrationForm
      key={key}
      initialValues={initialValues}
      availability={availability}
      persistedExportSource={null}
      isParquetOverride={false}
      isSaving={false}
      onSubmit={onSubmit}
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
        buildBlobStorageFormValues(savedConfig, availability),
      ),
    );
    fireEvent.change(bucketInput(), { target: { value: "edited-bucket" } });
    expect(bucketInput()).toHaveValue("edited-bucket");

    // Container behavior after delete: config becomes null → key flips.
    rerender(ui("p1:new", buildBlobStorageFormValues(undefined, availability)));

    expect(bucketInput()).toHaveValue("");
    expect(screen.getByLabelText("Region")).toHaveValue("auto");
  });

  it("project switch: key change discards unsaved input from the previous project", () => {
    const { rerender } = render(
      ui("p1:new", buildBlobStorageFormValues(undefined, availability)),
    );
    fireEvent.change(bucketInput(), {
      target: { value: "project-a-secret-bucket" },
    });
    fireEvent.change(screen.getByLabelText(/Access Key ID/), {
      target: { value: "AKIA-PROJECT-A" },
    });

    rerender(ui("p2:new", buildBlobStorageFormValues(undefined, availability)));

    expect(bucketInput()).toHaveValue("");
    expect(screen.getByLabelText(/Access Key ID/)).toHaveValue("");
  });

  it("post-create: key flip to 'configured' initializes from the saved config", () => {
    const { rerender } = render(
      ui("p1:new", buildBlobStorageFormValues(undefined, availability)),
    );
    fireEvent.change(bucketInput(), { target: { value: "typed-before-save" } });

    rerender(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(savedConfig, availability),
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
        buildBlobStorageFormValues(savedConfig, availability),
      ),
    );
    fireEvent.change(bucketInput(), { target: { value: "mid-save-typing" } });

    rerender(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(
          { ...savedConfig, bucketName: "refetched-bucket" },
          availability,
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
        buildBlobStorageFormValues(undefined, availability),
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
        enabled: false,
      }),
      expect.anything(),
    );
  });

  it("provider switch to S3-compatible reveals endpoint and force-path-style fields", async () => {
    render(ui("p1:new", buildBlobStorageFormValues(undefined, availability)));
    expect(screen.queryByText("Endpoint URL")).not.toBeInTheDocument();
    expect(screen.queryByText("Force Path Style")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(
      await screen.findByRole("option", { name: "S3 Compatible Storage" }),
    );

    expect(screen.getByText("Endpoint URL")).toBeInTheDocument();
    expect(screen.getByText("Force Path Style")).toBeInTheDocument();
  });

  it("non-Parquet file type shows the gzip toggle; Parquet hides it", () => {
    const { rerender } = render(
      ui(
        "a",
        buildBlobStorageFormValues(
          { fileType: BlobStorageIntegrationFileType.JSONL },
          availability,
        ),
      ),
    );
    expect(screen.getByText("Gzip Compression")).toBeInTheDocument();

    rerender(ui("b", buildBlobStorageFormValues(undefined, availability)));
    expect(screen.queryByText("Gzip Compression")).not.toBeInTheDocument();
  });

  it("custom-date export mode reveals the start date field", () => {
    render(
      ui(
        "a",
        buildBlobStorageFormValues(
          {
            exportMode: BlobStorageExportMode.FROM_CUSTOM_DATE,
            exportStartDate: new Date("2025-01-01T00:00:00Z"),
          },
          availability,
        ),
      ),
    );
    expect(screen.getByLabelText("Export Start Date")).toHaveValue(
      "2025-01-01",
    );
  });

  it("blocks save when the persisted export source is not selectable (LFE-10296)", async () => {
    const blocked: ExportSourceAvailability = {
      eventsExportAvailable: false,
      forceEventsExport: false,
    };
    const onSubmit = vi.fn();
    render(
      <TooltipProvider>
        <BlobStorageIntegrationForm
          initialValues={buildBlobStorageFormValues(
            {
              exportSource: AnalyticsIntegrationExportSource.EVENTS,
              bucketName: "valid-bucket",
            },
            blocked,
          )}
          availability={blocked}
          persistedExportSource={AnalyticsIntegrationExportSource.EVENTS}
          isParquetOverride={false}
          isSaving={false}
          onSubmit={onSubmit}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "This export source is not available on this deployment. Select an available export source to save.",
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
