import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  BlobStorageIntegrationFileType,
  BlobStorageIntegrationType,
  LEGACY_BLOB_EXPORT_CUTOFF,
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
  projectCreatedAt: new Date(LEGACY_BLOB_EXPORT_CUTOFF.getTime() + 1),
  integrationCreatedAt: null,
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
  slots?: { children?: ReactNode; destructiveAction?: ReactNode },
) => (
  <TooltipProvider>
    <BlobStorageIntegrationForm
      key={key}
      initialValues={initialValues}
      exportSourceCtx={exportSourceCtx}
      persistedExportSource={null}
      isSaving={false}
      onSubmit={onSubmit}
      destructiveAction={slots?.destructiveAction}
    >
      {slots?.children}
    </BlobStorageIntegrationForm>
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
        enabled: false,
      }),
      expect.anything(),
    );
  });
});

describe("BlobStorageIntegrationForm action bar", () => {
  it("Save is the form's submit button, so a native form submit saves the draft", async () => {
    const onSubmit = vi.fn();
    render(
      ui(
        "p1:new",
        buildBlobStorageFormValues(undefined, exportSourceCtx),
        onSubmit,
      ),
    );

    fireEvent.change(bucketInput(), { target: { value: "my-new-bucket" } });

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("type", "submit");

    // Submitting the form itself (e.g. Enter in a text field) must save,
    // which only works while Save lives inside the <form>.
    fireEvent.submit(save.closest("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("keeps the destructive action out of the Save/secondary action group", () => {
    render(
      ui(
        "p1:configured",
        buildBlobStorageFormValues(savedConfig, exportSourceCtx),
        () => {},
        {
          children: <button type="button">Validate</button>,
          destructiveAction: <button type="button">Reset</button>,
        },
      ),
    );

    const save = screen.getByRole("button", { name: "Save" });
    const validate = screen.getByRole("button", { name: "Validate" });
    const reset = screen.getByRole("button", { name: "Reset" });

    // Save and the secondary actions share the action bar directly; the
    // destructive action is wrapped in its own separated slot.
    expect(validate.parentElement).toBe(save.parentElement);
    expect(reset.parentElement).not.toBe(save.parentElement);
    expect(reset.parentElement).toHaveClass("ml-auto");
  });
});
