import {
  PlainClient as SdkPlainClient,
  ThreadFieldSchemaType,
  AttachmentType,
  type EventComponentInput,
} from "@team-plain/typescript-sdk";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";
import { PLAIN_MAX_FILE_SIZE_BYTES } from "./plainConstants";

// Re-export for backward compatibility
export { PLAIN_MAX_FILE_SIZE_BYTES };

// ===== App-level types exported for router use =====
export type Project = { id: string };
export type Organization = {
  id: string;
  name: string;
  plan?: string;
  projects?: Project[];
};
export type SessionUser = {
  email?: string | null;
  name?: string | null;
  organizations?: Organization[];
};

export type PrepareAttachmentUploadInput = {
  fileName: string;
  fileSizeBytes: number;
};

export type PrepareAttachmentUploadResult = {
  attachmentId: string;
  uploadFormUrl: string;
  uploadFormData: { key: string; value: string }[];
  fileName: string;
  fileSizeBytes: number;
};

export type CreateSupportThreadResult = {
  threadId: string;
  createdAt?: string;
  status?: string;
  createdWithThreadFields: boolean;
};

// ===== Context & init (DI) =====
export type PlainCtx = { client: SdkPlainClient };

export function initPlain(params: { apiKey?: string | null }): PlainCtx {
  const apiKey = params.apiKey ?? "";
  if (!apiKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Missing PLAIN_API_KEY",
    });
  }
  return { client: new SdkPlainClient({ apiKey }) };
}

// ===== Internal helpers =====
function describeSdkError(err: unknown) {
  const e = err as any;
  return {
    name: e?.name,
    message: e?.message,
    type: e?.type,
    code: e?.code,
    fields: e?.fields,
    errorDetails: e?.errorDetails,
    status: e?.status,
  };
}

/**
 * Formats Plain API errors into user-friendly messages
 * @returns User-friendly error message and appropriate HTTP status code
 */
function formatPlainError(error: unknown): {
  message: string;
  code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR";
} {
  const e = error as any;
  const errorMessage =
    e?.message || e?.errorDetails?.message || String(error) || "";
  const msg = errorMessage.toLowerCase();

  // File size errors
  if (
    msg.includes("file size") ||
    msg.includes("too large") ||
    msg.includes(">6mb") ||
    msg.includes("larger than")
  ) {
    return {
      message: `File is too large. Maximum file size is ${(PLAIN_MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB per file.`,
      code: "BAD_REQUEST",
    };
  }

  // File type errors
  if (msg.includes("file type") || msg.includes("not supported")) {
    return {
      message: "File type not supported. Please select a different file.",
      code: "BAD_REQUEST",
    };
  }

  // Rate limit errors
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return {
      message: "Too many requests. Please try again in a moment.",
      code: "BAD_REQUEST",
    };
  }

  // Extract original message if available and meaningful
  if (errorMessage && errorMessage.length > 0 && errorMessage.length < 200) {
    return {
      message: errorMessage,
      code: "BAD_REQUEST",
    };
  }

  // Fallback for unknown errors
  return {
    message: "Failed to prepare file upload. Please try again.",
    code: "INTERNAL_SERVER_ERROR",
  };
}

function unwrap<T>(label: string, res: { data?: T; error?: unknown }): T {
  if (res.error) {
    logger.error(`${label} failed`, describeSdkError(res.error));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Plain Client: ${label} failed`,
      cause: res.error,
    });
  }
  if (!res.data) {
    logger.error(`${label} returned no data`, res);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Plain Client: ${label} returned no data`,
    });
  }
  return res.data;
}

export function generateTenantExternalId(orgId: string, region: string) {
  return `cloud_${region}_org_${orgId}`;
}

// ===== Customers =====
export async function ensureCustomer(
  ctx: PlainCtx,
  params: { email: string; fullName?: string },
): Promise<string> {
  const { client } = ctx;
  const { email, fullName } = params;

  const upsert = await client.upsertCustomer({
    identifier: { emailAddress: email },
    onCreate: {
      fullName: fullName ?? "",
      email: { email, isVerified: true },
    },
    onUpdate: {
      fullName: fullName ? { value: fullName } : undefined,
      email: { email, isVerified: true },
    },
  });

  const upsertData = unwrap("upsertCustomer", upsert); // throws on error
  const customerId = upsertData.customer?.id;
  if (!customerId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Plain did not return a customer id.",
    });
  }
  return customerId;
}

// ===== Attachments =====
export async function createAttachmentUploadUrls(
  ctx: PlainCtx,
  customerId: string,
  files: PrepareAttachmentUploadInput[],
): Promise<PrepareAttachmentUploadResult[]> {
  const { client } = ctx;
  const out: PrepareAttachmentUploadResult[] = [];

  for (const f of files) {
    const r = await client.createAttachmentUploadUrl({
      customerId,
      fileName: f.fileName,
      fileSizeBytes: f.fileSizeBytes,
      attachmentType: AttachmentType.Email,
    });

    // Handle Plain API errors with user-friendly messages
    if (r.error) {
      const formatted = formatPlainError(r.error);
      logger.error(
        "createAttachmentUploadUrl failed",
        describeSdkError(r.error),
      );
      throw new TRPCError({
        code: formatted.code,
        message: formatted.message,
        cause: r.error,
      });
    }

    if (!r.data) {
      logger.error("createAttachmentUploadUrl returned no data", r);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Plain Client: createAttachmentUploadUrl returned no data",
      });
    }

    out.push({
      attachmentId: r.data.attachment.id,
      uploadFormUrl: r.data.uploadFormUrl,
      uploadFormData: r.data.uploadFormData,
      fileName: f.fileName,
      fileSizeBytes: f.fileSizeBytes,
    });
  }
  return out;
}

// ===== Tenants & tiers (best-effort / non-throwing) =====
export async function syncTenantsAndTiers(
  ctx: PlainCtx,
  params: { user: SessionUser; region: string; demoOrgId?: string },
) {
  const { client } = ctx;
  const { user, region, demoOrgId } = params;
  if (!Array.isArray(user?.organizations)) return;

  await Promise.all(
    user.organizations.map(async (org: Organization) => {
      const extId = generateTenantExternalId(org.id, region);
      const upsertTenantRes = await client.upsertTenant({
        identifier: { externalId: extId },
        name: `${region} - ${org.name}`,
        externalId: extId,
      });
      if (upsertTenantRes.error) {
        logger.error(
          "upsertTenant failed",
          describeSdkError(upsertTenantRes.error),
        );
        return;
      }

      const tierExternalId =
        org?.id === demoOrgId ? "cloud:demo" : (org?.plan ?? "default");
      const tierRes = await client.updateTenantTier({
        tenantIdentifier: { externalId: extId },
        tierIdentifier: { externalId: tierExternalId },
      });
      if (tierRes.error) {
        logger.error(
          "updateTenantTier failed",
          describeSdkError(tierRes.error),
        );
      }
    }),
  );
}

// ===== Tenant memberships (best-effort / non-throwing) =====
async function fetchAllCustomerTenantMemberships(
  ctx: PlainCtx,
  customerId: string,
) {
  const { client } = ctx;
  type Membership = { tenant: { externalId: string } };
  const out: Membership[] = [];
  let after: string | undefined = undefined;
  const pageSize = 100;

  while (true) {
    const r = await client.getCustomerTenantMemberships({
      customerId,
      first: pageSize,
      after,
    });
    if (r.error) {
      logger.error(
        "getCustomerTenantMemberships failed",
        describeSdkError(r.error),
      );
      break;
    }
    const memberships = r.data?.tenantMemberships as Membership[] | undefined;
    if (memberships?.length) out.push(...memberships);

    const pageInfo = r.data?.pageInfo as
      | { hasNextPage?: boolean; endCursor?: string }
      | undefined;
    if (pageInfo?.hasNextPage && pageInfo.endCursor) {
      after = pageInfo.endCursor;
    } else {
      break;
    }
  }
  return out;
}

export async function syncCustomerTenantMemberships(
  ctx: PlainCtx,
  params: {
    email: string;
    customerId: string;
    user: SessionUser;
    region: string;
  },
) {
  const { client } = ctx;
  const { email, customerId, user, region } = params;
  if (!region) return;
  if (!Array.isArray(user?.organizations)) return;

  const currentMemberships = await fetchAllCustomerTenantMemberships(
    ctx,
    customerId,
  );

  const regionPrefix = `cloud_${region}_org_`;
  const existingTenantIdsInRegion = currentMemberships
    .map((m) => m.tenant.externalId)
    .filter((id) => id?.startsWith(regionPrefix));

  const targetTenantIds: string[] = user.organizations.map((org) =>
    generateTenantExternalId(org.id, region),
  );

  const toRemove = existingTenantIdsInRegion.filter(
    (id) => !targetTenantIds.includes(id),
  );
  const toAdd = targetTenantIds.filter(
    (id) => !existingTenantIdsInRegion.includes(id),
  );

  if (toRemove.length) {
    const r = await client.removeCustomerFromTenants({
      customerIdentifier: { emailAddress: email },
      tenantIdentifiers: toRemove.map((externalId) => ({ externalId })),
    });
    if (r.error)
      logger.error(
        "removeCustomerFromTenants failed",
        describeSdkError(r.error),
      );
  }

  if (toAdd.length) {
    const r = await client.addCustomerToTenants({
      customerIdentifier: { emailAddress: email },
      tenantIdentifiers: toAdd.map((externalId) => ({ externalId })),
    });
    if (r.error)
      logger.error("addCustomerToTenants failed", describeSdkError(r.error));
  }
}

// ===== Thread field mapping (domain → Plain fields) =====
const THREAD_FIELDS = {
  messageType: "message_type",
  severity: "severity",
  topic: "topic",
  topicOperationsSubtype: "operations_subtype",
  topicProductFeaturesSubtype: "product_features_subtype",
  integrationType: "integration_type",
  url: "url",
} as const;

function buildThreadFields(input: {
  messageType: string;
  severity: string;
  topLevel: "Operations" | "Product Features";
  subtype: string;
  url?: string;
  integrationType?: string;
}) {
  const enumFields = [
    {
      key: THREAD_FIELDS.messageType,
      type: ThreadFieldSchemaType.Enum,
      stringValue: input.messageType,
    },
    {
      key: THREAD_FIELDS.severity,
      type: ThreadFieldSchemaType.Enum,
      stringValue: input.severity,
    },
    {
      key: THREAD_FIELDS.topic,
      type: ThreadFieldSchemaType.Enum,
      stringValue: input.topLevel,
    },
    ...(input.topLevel === "Operations" && THREAD_FIELDS.topicOperationsSubtype
      ? [
          {
            key: THREAD_FIELDS.topicOperationsSubtype,
            type: ThreadFieldSchemaType.Enum,
            stringValue: input.subtype,
          } as const,
        ]
      : []),
    ...(input.topLevel === "Product Features" &&
    THREAD_FIELDS.topicProductFeaturesSubtype
      ? [
          {
            key: THREAD_FIELDS.topicProductFeaturesSubtype,
            type: ThreadFieldSchemaType.Enum,
            stringValue: input.subtype,
          } as const,
        ]
      : []),
  ];

  const textFields = [
    input.url && {
      key: THREAD_FIELDS.url,
      type: ThreadFieldSchemaType.String,
      stringValue: input.url,
    },
    input.integrationType && {
      key: THREAD_FIELDS.integrationType,
      type: ThreadFieldSchemaType.String,
      stringValue: input.integrationType,
    },
  ].filter(Boolean) as {
    key: string;
    type: ThreadFieldSchemaType;
    stringValue?: string;
  }[];

  return [...enumFields, ...textFields];
}

// ===== Threads =====
export async function createSupportThread(
  ctx: PlainCtx,
  input: {
    email: string;
    title: string;
    message: string;
    messageType: string;
    severity: string;
    topicTopLevel: "Operations" | "Product Features";
    topicSubtype: string;
    url?: string;
    integrationType?: string;
    attachmentIds?: string[];
    tenantExternalId?: string;
  },
): Promise<CreateSupportThreadResult> {
  const { client } = ctx;

  const components = [{ componentText: { text: input.message } }];

  const threadFields = buildThreadFields({
    messageType: input.messageType,
    severity: input.severity,
    topLevel: input.topicTopLevel,
    subtype: input.topicSubtype,
    url: input.url,
    integrationType: input.integrationType,
  });

  const attachmentIds = input.attachmentIds ?? [];

  // Try WITH threadFields
  const createdWithFields = await client.createThread({
    title: input.title,
    customerIdentifier: { emailAddress: input.email },
    components,
    threadFields,
    tenantIdentifier: input.tenantExternalId
      ? { externalId: input.tenantExternalId }
      : undefined,
    attachmentIds: attachmentIds.length ? attachmentIds : undefined,
  });

  if (createdWithFields.error) {
    logger.error(
      "createThread with threadFields failed — retrying without threadFields",
      describeSdkError(createdWithFields.error),
    );

    // Retry WITHOUT threadFields
    const retry = await client.createThread({
      title: input.title,
      customerIdentifier: { emailAddress: input.email },
      components,
      tenantIdentifier: input.tenantExternalId
        ? { externalId: input.tenantExternalId }
        : undefined,
      attachmentIds: attachmentIds.length ? attachmentIds : undefined,
    });

    const thread = unwrap("createThread (retry without threadFields)", retry); // throws on error
    const createdAt =
      thread.createdAt?.__typename === "DateTime"
        ? thread.createdAt.iso8601
        : undefined;

    return {
      threadId: thread.id,
      status: thread.status,
      createdAt,
      createdWithThreadFields: false,
    };
  }

  const thread = unwrap("createThread", createdWithFields); // throws on error
  const createdAt =
    thread.createdAt?.__typename === "DateTime"
      ? thread.createdAt.iso8601
      : undefined;

  return {
    threadId: thread.id,
    status: thread.status,
    createdAt,
    createdWithThreadFields: true,
  };
}

// ===== Events (best-effort logging on failure) =====
export async function createThreadEvent(
  ctx: PlainCtx,
  input: {
    threadId: string;
    title: string;
    components: EventComponentInput[];
    externalId?: string;
  },
) {
  const { client } = ctx;
  const res = await client.createThreadEvent({
    title: input.title,
    threadId: input.threadId,
    components: input.components,
    externalId: input.externalId,
  });

  if (res.error) {
    logger.error("createThreadEvent failed", describeSdkError(res.error));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Plain Client: createThreadEvent failed",
      cause: res.error,
    });
  }
}

// ===== Notifications (best-effort / non-throwing) =====
export async function replyToThread(
  ctx: PlainCtx,
  input: {
    threadId: string;
    userEmail: string;
    originalMessage: string;
    attachmentIds?: string[];
    impersonate?: boolean;
  },
) {
  const { client } = ctx;
  const res = await client.replyToThread({
    threadId: input.threadId,
    textContent: input.originalMessage,
    markdownContent: input.originalMessage,
    attachmentIds:
      input.attachmentIds && input.attachmentIds.length
        ? input.attachmentIds
        : undefined,
    impersonation:
      input.impersonate === true
        ? {
            asCustomer: {
              customerIdentifier: {
                emailAddress: input.userEmail,
              },
            },
          }
        : undefined,
  });

  if (res.error) {
    logger.error("replyToThread failed", describeSdkError(res.error));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Plain Client: replyToThread failed",
      cause: res.error,
    });
  }

  return res;
}

// ===== Threads (no initial message) =====
export async function createThread(
  ctx: PlainCtx,
  input: {
    email: string;
    title: string;
    messageType: string;
    severity: string;
    topicTopLevel: "Operations" | "Product Features";
    topicSubtype: string;
    url?: string;
    integrationType?: string;
    tenantExternalId?: string;
    message?: string;
  },
): Promise<CreateSupportThreadResult> {
  const { client } = ctx;

  const threadFields = buildThreadFields({
    messageType: input.messageType,
    severity: input.severity,
    topLevel: input.topicTopLevel,
    subtype: input.topicSubtype,
    url: input.url,
    integrationType: input.integrationType,
  });

  // Try WITH threadFields
  const createdWithFields = await client.createThread({
    title: input.title,
    customerIdentifier: { emailAddress: input.email },
    threadFields,
    tenantIdentifier: input.tenantExternalId
      ? { externalId: input.tenantExternalId }
      : undefined,
    description: input.message,
  });

  if (createdWithFields.error) {
    logger.error(
      "createThread (no initial message) with threadFields failed — retrying without threadFields",
      describeSdkError(createdWithFields.error),
    );

    // Retry WITHOUT threadFields
    const retry = await client.createThread({
      title: input.title,
      customerIdentifier: { emailAddress: input.email },
      tenantIdentifier: input.tenantExternalId
        ? { externalId: input.tenantExternalId }
        : undefined,
      description: input.message,
    });

    const thread = unwrap(
      "createThread (no initial message, retry without threadFields)",
      retry,
    );
    const createdAt =
      thread.createdAt?.__typename === "DateTime"
        ? thread.createdAt.iso8601
        : undefined;

    return {
      threadId: thread.id,
      status: thread.status,
      createdAt,
      createdWithThreadFields: false,
    };
  }

  const thread = unwrap("createThread (no initial message)", createdWithFields);
  const createdAt =
    thread.createdAt?.__typename === "DateTime"
      ? thread.createdAt.iso8601
      : undefined;

  return {
    threadId: thread.id,
    status: thread.status,
    createdAt,
    createdWithThreadFields: true,
  };
}
