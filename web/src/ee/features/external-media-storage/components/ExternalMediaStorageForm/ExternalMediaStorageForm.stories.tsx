import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { type ExternalMediaStorageFormValues } from "@/src/ee/features/external-media-storage/types";

import { ExternalMediaStorageForm } from "./ExternalMediaStorageForm";

const defaultValues: ExternalMediaStorageFormValues = {
  type: "S3",
  authType: "ACCESS_KEYS",
  bucketName: "",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  roleArn: "",
  prefix: "",
  forcePathStyle: false,
};

const onSubmit = fn();

const noExternalId = {
  isSet: false,
  value: undefined,
  isLoading: false,
  reveal: fn(),
};

const meta = preview.meta({
  component: ExternalMediaStorageForm,
  args: {
    formId: "external-media-storage-story-form",
    initialValues: defaultValues,
    onSubmit,
    secretAccessKeyDisplay: null,
    crossAccountRoleArn: null,
    externalId: noExternalId,
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

export const IamRole = meta.story({
  args: {
    initialValues: {
      ...defaultValues,
      authType: "ROLE_ARN",
      bucketName: "production-media",
      roleArn: "arn:aws:iam::123456789012:role/langfuse-media",
      prefix: "langfuse-media/",
    },
    crossAccountRoleArn:
      "arn:aws:iam::210987654321:role/LangfuseCustomerStorageAccess",
    externalId: { ...noExternalId, isSet: true },
  },
});

export const IamRoleUnsaved = meta.story({
  args: {
    ...IamRole.input.args,
    externalId: noExternalId,
  },
});

export const IamRoleRevealedExternalId = meta.story({
  args: {
    ...IamRole.input.args,
    externalId: {
      ...noExternalId,
      isSet: true,
      value: "lf-0123456789abcdef0123456789abcdef",
    },
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
