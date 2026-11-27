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
  };

export const sendBlobStorageExportFailedEmail = (
  params: SendBlobStorageExportFailedEmailParams,
) => sendIntegrationExportFailedEmail(blobStorageExportFailedEmailCopy, params);
