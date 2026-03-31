import { logger } from "@langfuse/shared/src/server";

const PYLON_API_BASE = "https://api.usepylon.com";

type CreatePylonIssueParams = {
  apiKey: string;
  title: string;
  bodyHtml: string;
  requesterEmail: string;
  requesterName?: string;
  tags?: string[];
  priority?: "urgent" | "high" | "medium" | "low";
  attachmentUrls?: string[];
  customFields?: { slug: string; value?: string; values?: string[] }[];
};

type PylonIssueResponse = {
  data?: {
    id: string;
    number: number;
    link: string;
    state: string;
    account?: { id: string };
  };
  request_id?: string;
  errors?: string[];
};

export async function createPylonIssue(
  params: CreatePylonIssueParams,
): Promise<PylonIssueResponse> {
  const {
    apiKey,
    title,
    bodyHtml,
    requesterEmail,
    requesterName,
    tags,
    priority,
    attachmentUrls,
  } = params;

  const body: Record<string, unknown> = {
    title,
    body_html: bodyHtml,
    requester_email: requesterEmail,
    destination_metadata: {
      destination: "email",
      email: "support@langfuse.com",
    },
  };

  if (requesterName) body.requester_name = requesterName;
  if (tags?.length) body.tags = tags;
  if (priority) body.priority = priority;
  if (attachmentUrls?.length) body.attachment_urls = attachmentUrls;
  if (params.customFields?.length) body.custom_fields = params.customFields;

  const res = await fetch(`${PYLON_API_BASE}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as PylonIssueResponse;

  if (!res.ok) {
    const errorMsg = json.errors?.join(", ") ?? res.statusText;
    logger.error("Pylon createIssue failed", {
      status: res.status,
      errors: json.errors,
      requestId: json.request_id,
    });
    throw new Error(`Pylon API error (${res.status}): ${errorMsg}`);
  }

  return json;
}

type UploadPylonAttachmentParams = {
  apiKey: string;
  file: Buffer;
  fileName: string;
};

type PylonAttachmentResponse = {
  data?: {
    id: string;
    url: string;
    name: string;
  };
  request_id?: string;
  errors?: string[];
};

export async function uploadPylonAttachment(
  params: UploadPylonAttachmentParams,
): Promise<PylonAttachmentResponse> {
  const { apiKey, file, fileName } = params;

  const arrayBuffer = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  const formData = new FormData();
  formData.append("file", new Blob([arrayBuffer]), fileName);

  const res = await fetch(`${PYLON_API_BASE}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = (await res.json()) as PylonAttachmentResponse;

  if (!res.ok) {
    const errorMsg = json.errors?.join(", ") ?? res.statusText;
    logger.error("Pylon uploadAttachment failed", {
      status: res.status,
      errors: json.errors,
      requestId: json.request_id,
    });
    throw new Error(
      `Pylon attachment upload error (${res.status}): ${errorMsg}`,
    );
  }

  return json;
}

type UpdatePylonAccountParams = {
  apiKey: string;
  accountId: string;
  customFields: { slug: string; value: string }[];
};

export async function updatePylonAccountCustomFields(
  params: UpdatePylonAccountParams,
): Promise<void> {
  const { apiKey, accountId, customFields } = params;

  const res = await fetch(`${PYLON_API_BASE}/accounts/${accountId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ custom_fields: customFields }),
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      errors?: string[];
      request_id?: string;
    };
    const errorMsg = json.errors?.join(", ") ?? res.statusText;
    logger.error("Pylon updateAccount failed", {
      status: res.status,
      errors: json.errors,
      requestId: json.request_id,
    });
    throw new Error(`Pylon account update error (${res.status}): ${errorMsg}`);
  }
}

export function mapSeverityToPylonPriority(
  severity: string,
): "urgent" | "high" | "medium" | "low" {
  switch (severity) {
    case "Outage, data loss, or data breach":
      return "urgent";
    case "Feature is not working at all":
      return "high";
    case "Feature not working as expected":
      return "medium";
    case "Question or feature request":
    default:
      return "low";
  }
}

export function buildPylonIssueBodyHtml(params: {
  message: string;
  requesterEmail: string;
}): string {
  const escapedEmail = escapeHtml(params.requesterEmail);
  const escapedMessage = escapeHtml(params.message);

  const lines: string[] = [
    `<p>Hi there,</p>`,
    `<p>thanks for reaching out! We've received your request and will follow up as soon as possible.</p>`,
    `<p>To help us move faster, feel free to reply to this email with:</p>`,
    `<ul>`,
    `<li>any error messages or screenshots</li>`,
    `<li>links to where you're seeing the issue (trace, page, dataset)</li>`,
    `<li>steps to reproduce (if relevant)</li>`,
    `</ul>`,
    `<p>Thanks,</p>`,
    `<p>Team Langfuse</p>`,
    `<hr>`,
    `<p><b>${escapedEmail} wrote:</b></p>`,
    `<blockquote>${escapedMessage.replace(/\n/g, "<br>")}</blockquote>`,
  ];

  return lines.join("\n");
}

export function buildPylonMetadataString(params: {
  messageType?: string;
  severity?: string;
  topic?: string;
  integrationType?: string;
  url?: string;
  organizationId?: string;
  projectId?: string;
  plan?: string;
  cloudRegion?: string;
  version?: string;
  browserMetadata?: Record<string, unknown>;
}): string {
  const rows: string[] = [];
  if (params.messageType) rows.push(`Type: ${params.messageType}`);
  if (params.severity) rows.push(`Severity: ${params.severity}`);
  if (params.topic) rows.push(`Topic: ${params.topic}`);
  if (params.integrationType)
    rows.push(`Integration: ${params.integrationType}`);
  if (params.url) rows.push(`URL: ${params.url}`);
  if (params.organizationId)
    rows.push(`Organization ID: ${params.organizationId}`);
  if (params.projectId) rows.push(`Project ID: ${params.projectId}`);
  if (params.plan) rows.push(`Plan: ${params.plan}`);
  if (params.cloudRegion) rows.push(`Cloud Region: ${params.cloudRegion}`);
  if (params.version) rows.push(`Version: ${params.version}`);
  if (params.browserMetadata)
    rows.push(`Browser: ${JSON.stringify(params.browserMetadata)}`);
  return rows.join("\n");
}

export function mapMessageTypeToPylonQuestionType(messageType: string): string {
  switch (messageType) {
    case "Bug":
      return "bug";
    case "Feedback":
      return "feature_request";
    case "Question":
    default:
      return "question";
  }
}

export function mapToPylonCaseSeverity(params: {
  severity: string;
  plan?: string;
}): "Sev-1" | "Sev-2" | "Sev-3" {
  const { severity, plan } = params;
  const isHighTierPlan =
    plan === "cloud:team" ||
    plan === "cloud:enterprise" ||
    plan === "self-hosted:enterprise";

  if (severity === "Outage, data loss, or data breach" && isHighTierPlan) {
    return "Sev-1";
  }

  if (
    severity === "Outage, data loss, or data breach" ||
    severity === "Feature is not working at all"
  ) {
    return "Sev-2";
  }

  return "Sev-3";
}

export function mapPlanToPylonCustomerTier(plan: string): string {
  if (plan === "oss") return "self_hosted_free";
  return plan.replace(/[:-]/g, "_");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
