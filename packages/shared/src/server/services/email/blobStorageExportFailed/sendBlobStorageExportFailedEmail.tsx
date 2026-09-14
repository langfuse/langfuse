import React from "react";
import {
  sendIntegrationExportFailedEmail,
  type SendIntegrationExportFailedEmailParams,
} from "../integrationExportFailed/sendIntegrationExportFailedEmail";
import { type IntegrationExportFailedEmailCopy } from "../integrationExportFailed/IntegrationExportFailedEmailTemplate";

export type SendBlobStorageExportFailedEmailParams =
  SendIntegrationExportFailedEmailParams;

export const blobStorageExportFailedEmailCopy: IntegrationExportFailedEmailCopy =
  {
    subjectLabel: "Blob storage",
    headingLabel: "Blob Storage",
    inlineLabel: "blob storage",
    disabledBody: (projectName) => (
      <>
        The blob storage export for project &quot;{projectName}
        &quot; has been disabled after a configuration fault. This usually means
        the destination configuration or credentials are no longer valid. Once
        you have updated them, simply re-enable the export in the integration
        settings and it will pick up right where it left off.
      </>
    ),
  };

export const sendBlobStorageExportFailedEmail = (
  params: SendBlobStorageExportFailedEmailParams,
) => sendIntegrationExportFailedEmail(blobStorageExportFailedEmailCopy, params);
