import { vi, describe, it, expect, beforeEach } from "vitest";

const { add, getInstance, createExecution } = vi.hoisted(() => ({
  add: vi.fn(),
  getInstance: vi.fn(),
  createExecution: vi.fn(),
}));

vi.mock("../redis/webhookQueue", () => ({
  WebhookQueue: { getInstance: () => getInstance() },
}));

vi.mock("../repositories/automation-repository", () => ({
  getAutomations: vi.fn(),
}));

vi.mock("../services/getProjectAdminEmails", () => ({
  getProjectAdminEmails: vi.fn(),
}));

vi.mock(
  "../services/email/blobStorageExportFailed/sendBlobStorageExportFailedEmail",
  () => ({ sendBlobStorageExportFailedEmail: vi.fn() }),
);

vi.mock("../services/email/evaluatorBlocked/sendEvaluatorBlockedEmail", () => ({
  sendEvaluatorBlockedEmail: vi.fn(),
}));

// No importOriginal: db.ts imports the server barrel, which circularly imports
// this module under test; re-export the needed enums from @prisma/client instead.
vi.mock("../../db", async () => {
  const prismaClient = await import("@prisma/client");
  return {
    ActionExecutionStatus: prismaClient.ActionExecutionStatus,
    JobConfigState: prismaClient.JobConfigState,
    prisma: { automationExecution: { create: createExecution } },
  };
});

vi.mock("../../env", () => ({
  env: {
    EMAIL_FROM_ADDRESS: undefined as string | undefined,
    SMTP_CONNECTION_URL: undefined as string | undefined,
    NEXTAUTH_URL: undefined as string | undefined,
    CLOUD_CRM_EMAIL: undefined as string | undefined,
  },
}));

import { JobConfigState } from "@prisma/client";
import { type AutomationDomain } from "../../domain/automations";
import { env } from "../../env";
import { getAutomations } from "../repositories/automation-repository";
import { sendBlobStorageExportFailedEmail } from "../services/email/blobStorageExportFailed/sendBlobStorageExportFailedEmail";
import { sendEvaluatorBlockedEmail } from "../services/email/evaluatorBlocked/sendEvaluatorBlockedEmail";
import { getProjectAdminEmails } from "../services/getProjectAdminEmails";
import { dispatchProjectNotification } from "./dispatchProjectNotification";
import { type ProjectNotificationEvent } from "./types";

const blobEvent: ProjectNotificationEvent = {
  eventType: "blob-export-failed",
  severity: "ALERT",
  projectId: "proj_1",
  projectName: "My Project",
  resourceId: "res_1",
  resourceName: "my-export-bucket",
  message: "Blob storage export failed.",
  url: "https://cloud.langfuse.com/x",
};

const evaluatorEvent: ProjectNotificationEvent = {
  eventType: "evaluator-blocked",
  severity: "ALERT",
  projectId: "proj_1",
  projectName: "My Project",
  resourceId: "cfg_1",
  resourceName: "Toxicity",
  message: "Evaluator was blocked.",
  url: "https://cloud.langfuse.com/x",
  blockReason: "LLM_CONNECTION_MISSING",
  evalTemplateId: "tpl_1",
};

const automation = (
  id: string,
  status: JobConfigState,
  eventActions: string[],
): AutomationDomain =>
  ({
    id,
    name: id,
    trigger: { id: `trigger-${id}`, status, eventActions },
    action: { id: `action-${id}`, type: "WEBHOOK" },
  }) as unknown as AutomationDomain;

const emailEnvValues = {
  EMAIL_FROM_ADDRESS: "noreply@langfuse.com",
  SMTP_CONNECTION_URL: "smtp://localhost",
  NEXTAUTH_URL: "https://cloud.langfuse.com",
  CLOUD_CRM_EMAIL: "crm@langfuse.com",
};

const setEmailEnv = (values: Partial<typeof env>) => {
  env.EMAIL_FROM_ADDRESS = values.EMAIL_FROM_ADDRESS;
  env.SMTP_CONNECTION_URL = values.SMTP_CONNECTION_URL;
  env.NEXTAUTH_URL = values.NEXTAUTH_URL;
  env.CLOUD_CRM_EMAIL = values.CLOUD_CRM_EMAIL;
};

describe("dispatchProjectNotification", () => {
  beforeEach(() => {
    add.mockReset();
    getInstance.mockReset();
    getInstance.mockReturnValue({ add });
    createExecution.mockReset();
    vi.mocked(getAutomations).mockReset();
    vi.mocked(getAutomations).mockResolvedValue([]);
    vi.mocked(getProjectAdminEmails).mockReset();
    vi.mocked(getProjectAdminEmails).mockResolvedValue([]);
    vi.mocked(sendBlobStorageExportFailedEmail).mockReset();
    vi.mocked(sendEvaluatorBlockedEmail).mockReset();
    setEmailEnv({});
  });

  it("enqueues a webhook job only for active channels with the event enabled", async () => {
    vi.mocked(getAutomations).mockResolvedValue([
      automation("a1", JobConfigState.ACTIVE, ["blob-export-failed"]),
      automation("a2", JobConfigState.ACTIVE, ["evaluator-blocked"]),
      automation("a3", JobConfigState.INACTIVE, ["blob-export-failed"]),
      automation("a4", JobConfigState.ACTIVE, [
        "blob-export-failed",
        "evaluator-blocked",
      ]),
    ]);

    await dispatchProjectNotification({
      projectId: "proj_1",
      event: blobEvent,
    });

    // a1 and a4 have the event enabled; a2 has it toggled off, a3 is inactive.
    const enqueuedAutomationIds = add.mock.calls.map(
      (call) => call[1].payload.automationId,
    );
    expect(enqueuedAutomationIds.sort()).toEqual(["a1", "a4"]);
  });

  it("sends the evaluator-blocked email per recipient with the resolution url", async () => {
    setEmailEnv(emailEnvValues);
    vi.mocked(getProjectAdminEmails).mockResolvedValue([
      "admin1@example.com",
      "admin2@example.com",
    ]);

    await dispatchProjectNotification({
      projectId: "proj_1",
      event: evaluatorEvent,
    });

    expect(sendEvaluatorBlockedEmail).toHaveBeenCalledTimes(2);
    expect(sendEvaluatorBlockedEmail).toHaveBeenCalledWith({
      env: emailEnvValues,
      projectName: "My Project",
      evaluatorName: "Toxicity",
      blockReason: "LLM_CONNECTION_MISSING",
      blockMessage: "Evaluator was blocked.",
      // LLM_CONNECTION_MISSING resolves to the llm-connections settings page
      resolutionUrl:
        "https://cloud.langfuse.com/project/proj_1/settings/llm-connections",
      receiverEmail: "admin1@example.com",
    });
  });

  it("still sends admin emails when the channel dispatch throws", async () => {
    setEmailEnv(emailEnvValues);
    // A Postgres/Redis/queue error in the channel path must not suppress email.
    vi.mocked(getAutomations).mockRejectedValue(new Error("db down"));
    vi.mocked(getProjectAdminEmails).mockResolvedValue(["admin@example.com"]);

    await expect(
      dispatchProjectNotification({ projectId: "proj_1", event: blobEvent }),
    ).resolves.toBeUndefined();

    expect(add).not.toHaveBeenCalled();
    expect(sendBlobStorageExportFailedEmail).toHaveBeenCalledTimes(1);
  });
});
