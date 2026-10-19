import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

import { TestMediaObjectDialog } from "./TestMediaObjectDialog";

const previewImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23f1f5f9'/%3E%3Ctext x='160' y='90' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'%3EMedia preview%3C/text%3E%3C/svg%3E";

function TestMediaObjectDialogStory({
  isPending,
  onTest,
}: {
  isPending: boolean;
  onTest: (uri: string) => Promise<string | null>;
}) {
  return (
    <DialogController
      renderDialog={() => (
        <TestMediaObjectDialog isPending={isPending} onTest={onTest} />
      )}
    >
      {({ openDialog }) => (
        <button type="button" onClick={openDialog}>
          Test media object
        </button>
      )}
    </DialogController>
  );
}

const onTest = fn(async () => previewImage);

const meta = preview.meta({
  component: TestMediaObjectDialogStory,
  args: {
    isPending: false,
    onTest,
  },
});

export const Default = meta.story({});

export const TestsAndPreviewsImage = meta.story({
  name: "(Test) Tests and previews image",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    onTest.mockClear();

    await userEvent.click(
      canvas.getByRole("button", { name: "Test media object" }),
    );
    await userEvent.type(
      body.getByLabelText("S3 URI"),
      "s3://media-bucket/images/example.png",
    );
    await userEvent.click(body.getByRole("button", { name: "Test" }));

    await expect(onTest).toHaveBeenCalledWith(
      "s3://media-bucket/images/example.png",
    );
    await waitFor(() => expect(body.getByText("Preview")).toBeInTheDocument());
    await expect(
      body.getByRole("img", { name: "Preview example.png" }),
    ).toBeVisible();
  },
});
