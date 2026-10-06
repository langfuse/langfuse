import { BlobStorageIntegrationType } from "@langfuse/shared";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { type ExternalMediaStorageFormValues } from "@/src/features/external-media-storage/types";

import { ExternalMediaStorageForm } from "./ExternalMediaStorageForm";

const defaultValues: ExternalMediaStorageFormValues = {
  type: BlobStorageIntegrationType.S3,
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
    actions: null,
    allowHostCredentials: false,
    initialValues: defaultValues,
    isSaving: false,
    onSubmit,
    secretAccessKeyDisplay: null,
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
});

export const NewAmazonS3 = meta.story({});

export const SelfHosted = meta.story({
  args: {
    allowHostCredentials: true,
  },
});

export const S3Compatible = meta.story({
  args: {
    initialValues: {
      ...defaultValues,
      type: BlobStorageIntegrationType.S3_COMPATIBLE,
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

export const Saving = meta.story({
  args: {
    initialValues: {
      ...defaultValues,
      bucketName: "production-media",
    },
    isSaving: true,
  },
});

export const Submits = meta.story({
  name: "(Test) Submits",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    onSubmit.mockClear();

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
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(onSubmit).toHaveBeenCalledWith({
      ...defaultValues,
      bucketName: "media-bucket",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      prefix: "media/",
    });
  },
});
