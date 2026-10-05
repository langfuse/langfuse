import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { TestMediaObjectDialog } from "@/src/features/blobstorage-integration/components/TestMediaObjectDialog/TestMediaObjectDialog";

function TestHarness({
  onTest,
}: {
  onTest: (uri: string) => Promise<string | null>;
}) {
  return (
    <LayerProvider>
      <DialogController
        renderDialog={() => (
          <TestMediaObjectDialog isPending={false} onTest={onTest} />
        )}
      >
        {({ openDialog }) => (
          <button type="button" onClick={() => openDialog()}>
            Open test dialog
          </button>
        )}
      </DialogController>
    </LayerProvider>
  );
}

describe("TestMediaObjectDialog", () => {
  it("keeps a successful preview open and clears it when the URI changes", async () => {
    const onTest = vi
      .fn()
      .mockResolvedValue("https://signed.example.com/song.mp3?secret=value");
    render(<TestHarness onTest={onTest} />);

    fireEvent.click(screen.getByRole("button", { name: "Open test dialog" }));
    fireEvent.change(screen.getByLabelText("S3 URI"), {
      target: { value: "s3://bucket/media/song.mp3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    expect(
      await screen.findByLabelText("Preview song.mp3"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Test external media object" }),
    ).toBeInTheDocument();
    expect(onTest).toHaveBeenCalledWith("s3://bucket/media/song.mp3");

    fireEvent.change(screen.getByLabelText("S3 URI"), {
      target: { value: "s3://bucket/media/other.mp3" },
    });

    expect(screen.queryByLabelText("Preview song.mp3")).not.toBeInTheDocument();
  });

  it("shows media load failures inside the dialog", async () => {
    const onTest = vi
      .fn()
      .mockResolvedValue("https://signed.example.com/song.mp3?secret=value");
    render(<TestHarness onTest={onTest} />);

    fireEvent.click(screen.getByRole("button", { name: "Open test dialog" }));
    fireEvent.change(screen.getByLabelText("S3 URI"), {
      target: { value: "s3://bucket/media/song.mp3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    fireEvent.error(await screen.findByLabelText("Preview song.mp3"));

    expect(
      screen.getByText("The media preview could not be loaded."),
    ).toBeInTheDocument();
  });

  it("closes when interacting outside", async () => {
    render(<TestHarness onTest={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open test dialog" }));
    expect(
      screen.getByRole("dialog", { name: "Test external media object" }),
    ).toBeInTheDocument();

    const overlay = document.querySelector<HTMLElement>(
      '[data-layer="modal"] > [data-state="open"]:not([role="dialog"])',
    );
    expect(overlay).not.toBeNull();
    await act(
      () =>
        new Promise((resolve) => {
          window.setTimeout(resolve, 0);
        }),
    );
    fireEvent.pointerDown(overlay!, { button: 0, pointerType: "mouse" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Test external media object" }),
      ).not.toBeInTheDocument(),
    );
  });
});
