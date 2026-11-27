import {
  sendIntegrationExportFailedEmail,
  type SendIntegrationExportFailedEmailParams,
} from "../integrationExportFailed/sendIntegrationExportFailedEmail";
import { type IntegrationExportFailedEmailCopy } from "../integrationExportFailed/IntegrationExportFailedEmailTemplate";

export type SendPostHogExportFailedEmailParams =
  SendIntegrationExportFailedEmailParams;

export const postHogExportFailedEmailCopy: IntegrationExportFailedEmailCopy = {
  subjectLabel: "PostHog",
  headingLabel: "PostHog",
  inlineLabel: "PostHog",
};

export const sendPostHogExportFailedEmail = (
  params: SendPostHogExportFailedEmailParams,
) => sendIntegrationExportFailedEmail(postHogExportFailedEmailCopy, params);
