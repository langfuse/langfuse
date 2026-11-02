import React from "react";
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
  disabledBody: (projectName) => (
    <>
      The PostHog export for project &quot;{projectName}
      &quot; has been disabled after a configuration fault. This usually means
      the PostHog host is no longer reachable or valid. Once you have updated
      it, simply re-enable the export in the integration settings and it will
      pick up right where it left off.
    </>
  ),
};

export const sendPostHogExportFailedEmail = (
  params: SendPostHogExportFailedEmailParams,
) => sendIntegrationExportFailedEmail(postHogExportFailedEmailCopy, params);
