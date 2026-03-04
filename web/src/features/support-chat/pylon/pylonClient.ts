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
};

type PylonIssueResponse = {
  data?: {
    id: string;
    number: number;
    link: string;
    state: string;
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
      destination: "internal",
    },
  };

  if (requesterName) body.requester_name = requesterName;
  if (tags?.length) body.tags = tags;
  if (priority) body.priority = priority;
  if (attachmentUrls?.length) body.attachment_urls = attachmentUrls;

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

  const formData = new FormData();
  formData.append("file", new Blob([file]), fileName);

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
  url?: string;
  organizationId?: string;
  projectId?: string;
  version?: string;
  plan?: string;
  cloudRegion?: string;
  browserMetadata?: Record<string, unknown>;
  severity?: string;
  messageType?: string;
  topic?: string;
  integrationType?: string;
}): string {
  const escapedMessage = escapeHtml(params.message);
  const lines: string[] = [`<p>${escapedMessage.replace(/\n/g, "<br>")}</p>`];

  lines.push("<hr>");
  lines.push("<h4>Support Request Metadata</h4>");

  const metaRows: string[] = [];
  if (params.messageType)
    metaRows.push(`<b>Type:</b> ${escapeHtml(params.messageType)}`);
  if (params.severity)
    metaRows.push(`<b>Severity:</b> ${escapeHtml(params.severity)}`);
  if (params.topic) metaRows.push(`<b>Topic:</b> ${escapeHtml(params.topic)}`);
  if (params.integrationType)
    metaRows.push(`<b>Integration:</b> ${escapeHtml(params.integrationType)}`);
  if (params.url)
    metaRows.push(
      `<b>URL:</b> <a href="${escapeHtml(params.url)}">${escapeHtml(params.url)}</a>`,
    );
  if (params.organizationId)
    metaRows.push(
      `<b>Organization ID:</b> ${escapeHtml(params.organizationId)}`,
    );
  if (params.projectId)
    metaRows.push(`<b>Project ID:</b> ${escapeHtml(params.projectId)}`);
  if (params.plan) metaRows.push(`<b>Plan:</b> ${escapeHtml(params.plan)}`);
  if (params.cloudRegion)
    metaRows.push(`<b>Cloud Region:</b> ${escapeHtml(params.cloudRegion)}`);
  if (params.version)
    metaRows.push(`<b>Version:</b> ${escapeHtml(params.version)}`);
  if (params.browserMetadata) {
    metaRows.push(
      `<b>Browser:</b> <code>${escapeHtml(JSON.stringify(params.browserMetadata))}</code>`,
    );
  }

  if (metaRows.length > 0) {
    lines.push(`<p>${metaRows.join("<br>")}</p>`);
  }

  return lines.join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildPylonTags(params: {
  messageType: string;
  topLevel: string;
  subtype: string;
  integrationType?: string;
}): string[] {
  const tags = [params.messageType, params.topLevel, params.subtype];
  if (params.integrationType) tags.push(params.integrationType);
  return tags.filter(Boolean);
}
