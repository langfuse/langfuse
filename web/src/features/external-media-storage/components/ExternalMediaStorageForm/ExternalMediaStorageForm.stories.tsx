import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { type ExternalMediaStorageFormValues } from "@/src/features/external-media-storage/types";

import { ExternalMediaStorageForm } from "./ExternalMediaStorageForm";

const defaultValues: ExternalMediaStorageFormValues = {
  type: "S3",
  bucketName: "",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  prefix: "",
  enabled: true,
  forcePathStyle: false,
};

const onSubmit = fn();

const meta = preview.meta({
  component: ExternalMediaStorageForm,
  args: {
    formId: "external-media-storage-story-form",
    initialValues: defaultValues,
    onSubmit,
    secretAccessKeyDisplay: null,
  },
  render: (args) => (
    <div className="max-w-xl p-6">
      <ExternalMediaStorageForm
        {...args}
        renderActions={({ isDirty }) => (
          <Button
            text="Save"
            form="external-media-storage-story-form"
            type="submit"
            disabled={!isDirty}
          />
        )}
      />
    </div>
  ),
});

export const NewAmazonS3 = meta.story({});

export const S3Compatible = meta.story({
  args: {
    initialValues: {
      ...defaultValues,
      type: "S3_COMPATIBLE",
      bucketName: "media",
      endpoint: "https://s3.example.com",
      forcePathStyle: true,
    },
  },
});

export const SavedCredentials = meta.story({
  args: {
    initialValues: {
      ...defaultValues,
      bucketName: "production-media",
      accessKeyId: "AKIAEXAMPLE",
      prefix: "langfuse-media/",
    },
    secretAccessKeyDisplay: "••••••••••••••••",
  },
});

export const Submits = meta.story({
  name: "(Test) Submits",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    onSubmit.mockClear();

    const saveButton = canvas.getByRole("button", { name: "Save" });
    const bucketNameInput = canvas.getByLabelText("Bucket Name");
    await expect(saveButton).toBeDisabled();
    await userEvent.type(bucketNameInput, "temporary");
    await expect(saveButton).toBeEnabled();
    await userEvent.clear(bucketNameInput);
    await expect(saveButton).toBeDisabled();

    await userEvent.type(canvas.getByLabelText("Bucket Name"), "media-bucket");
    await userEvent.type(canvas.getByLabelText("Access Key ID"), "access-key");
    await userEvent.type(
      canvas.getByLabelText("Secret Access Key"),
      "secret-key",
    );
    await userEvent.type(
      canvas.getByLabelText("Media Prefix (optional)"),
      "media/",
    );
    await userEvent.click(saveButton);

    await expect(onSubmit).toHaveBeenCalledWith(
      {
        ...defaultValues,
        bucketName: "media-bucket",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        prefix: "media/",
      },
      expect.anything(),
    );
  },
});
