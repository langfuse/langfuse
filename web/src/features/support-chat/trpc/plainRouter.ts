import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "@langfuse/shared/src/server";
import { PlainClient, ThreadFieldSchemaType } from "@team-plain/typescript-sdk";
import {
  MessageTypeSchema,
  SeveritySchema,
  TopicSchema,
  TopicGroups,
} from "../formConstants";

// Minimal types we rely on from session
type Project = { id: string };
type Organization = {
  id: string;
  name: string;
  plan?: string;
  projects?: Project[];
};
type SessionUser = {
  email?: string | null;
  name?: string | null;
  organizations?: Organization[];
};

// =========================
// Error helpers (use shared logger)
// =========================
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

function unwrap<T>(label: string, res: { data?: T; error?: unknown }): T {
  if (res.error) {
    logger.error(`${label} failed`, describeSdkError(res.error));
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} failed`,
      cause: res.error,
    });
  }
  if (!res.data) {
    logger.error(`${label} returned no data`, res);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `${label} returned no data`,
    });
  }
  return res.data;
}

// =========================
// Plain Client & Env
// =========================
function getPlainClient() {
  const apiKey = process.env.PLAIN_API_KEY;
  if (!apiKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Missing PLAIN_API_KEY",
    });
  }
  return new PlainClient({ apiKey });
}

function getCloudRegion(): string | undefined {
  return process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
}

function getDemoOrgId(): string | undefined {
  return process.env.NEXT_PUBLIC_DEMO_ORG_ID;
}

// =========================
/** Keys must match what you configured in Plain */
const THREAD_FIELDS = {
  messageType: "message_type", // Enum (Dropdown)
  severity: "severity", // Enum
  topic: "topic", // Enum ("Operations" | "Product Features")
  topicOperationsSubtype: "operations_subtype",
  topicProductFeaturesSubtype: "product_features_subtype",
  browserMetadata: "browser_metadata", // Text
  organizationId: "organization_id", // Text
  projectId: "project_id", // Text
  url: "url", // Text
  version: "version", // Text
  plan: "plan", // Text
  cloudRegion: "cloud_region", // Text
  integrationType: "integration_type", // Text
} as const;

// =========================
/** Input Schemas */
const CreateSupportThreadInput = z.object({
  messageType: MessageTypeSchema,
  severity: SeveritySchema,
  topic: TopicSchema,
  message: z.string().trim().min(1),
  url: z.string().url().optional(),
  projectId: z.string().optional(),
  organizationId: z.string().optional(), // FE may pass; otherwise we derive
  version: z.string().optional(),
  plan: z.string().optional(),
  cloudRegion: z.string().optional().nullable(), // might be self-hosted
  browserMetadata: z.record(z.any()).optional(),
  integrationType: z.string().optional(),
});

// =========================
// Utilities
// =========================
function splitTopic(topic: z.infer<typeof TopicSchema>): {
  topLevel: "Operations" | "Product Features";
  subtype: string;
} {
  if ((TopicGroups.Operations as readonly string[]).includes(topic)) {
    return { topLevel: "Operations", subtype: topic };
  }
  return { topLevel: "Product Features", subtype: topic };
}

function buildThreadFields(input: z.infer<typeof CreateSupportThreadInput>) {
  const { topLevel, subtype } = splitTopic(input.topic);

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
      stringValue: topLevel,
    },
    ...(topLevel === "Operations" && THREAD_FIELDS.topicOperationsSubtype
      ? [
          {
            key: THREAD_FIELDS.topicOperationsSubtype,
            type: ThreadFieldSchemaType.Enum,
            stringValue: subtype,
          } as const,
        ]
      : []),
    ...(topLevel === "Product Features" &&
    THREAD_FIELDS.topicProductFeaturesSubtype
      ? [
          {
            key: THREAD_FIELDS.topicProductFeaturesSubtype,
            type: ThreadFieldSchemaType.Enum,
            stringValue: subtype,
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
    input.projectId && {
      key: THREAD_FIELDS.projectId,
      type: ThreadFieldSchemaType.String,
      stringValue: input.projectId,
    },
    input.organizationId && {
      key: THREAD_FIELDS.organizationId,
      type: ThreadFieldSchemaType.String,
      stringValue: input.organizationId,
    },
    input.version && {
      key: THREAD_FIELDS.version,
      type: ThreadFieldSchemaType.String,
      stringValue: input.version,
    },
    input.plan && {
      key: THREAD_FIELDS.plan,
      type: ThreadFieldSchemaType.String,
      stringValue: input.plan,
    },
    input.cloudRegion && {
      key: THREAD_FIELDS.cloudRegion,
      type: ThreadFieldSchemaType.String,
      stringValue: input.cloudRegion,
    },
    input.browserMetadata && {
      key: THREAD_FIELDS.browserMetadata,
      type: ThreadFieldSchemaType.String,
      stringValue: JSON.stringify(input.browserMetadata),
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

  return { enumFields, textFields, all: [...enumFields, ...textFields] };
}

// =========================
// Non-critical Plain helpers (isolated for reuse)
// =========================

/**
 * Compute Plain tenant external id from region + orgId
 * Format: cloud_${CLOUD_REGION}_org_${orgId}
 */
function tenantExternalId(orgId: string, region: string) {
  return `cloud_${region}_org_${orgId}`;
}

/** Ensure Tenants exist & set correct tier for each (non-throwing) */
async function ensureTenantsAndTiers(params: {
  client: PlainClient;
  user: SessionUser;
  region?: string;
  demoOrgId?: string;
}) {
  const { client, user, region, demoOrgId } = params;
  if (!region) return;
  if (!Array.isArray(user?.organizations)) return;

  await Promise.all(
    user.organizations.map(async (org: Organization) => {
      const extId: string = tenantExternalId(org.id, region);
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
        return; // non-critical
      }

      const tierExternalId: string =
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

/** Fetch ALL tenant memberships for a customer (paginated, non-throwing) */
async function fetchAllCustomerTenantMemberships(
  client: PlainClient,
  customerId: string,
) {
  type Membership = {
    tenant: { externalId: string };
  };
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
      break; // non-critical
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

/** Sync which tenants the customer belongs to (by region-scoped externalId) */
async function syncCustomerTenantMemberships(params: {
  client: PlainClient;
  email: string;
  customerId: string;
  user: SessionUser;
  region?: string;
}) {
  const { client, email, customerId, user, region } = params;
  if (!region) return;
  if (!Array.isArray(user?.organizations)) return;

  const currentMemberships = await fetchAllCustomerTenantMemberships(
    client,
    customerId,
  );
  const regionPrefix = `cloud_${region}_org_`;
  const existingTenantIdsInRegion = currentMemberships
    .map((m) => m.tenant.externalId)
    .filter((id) => id?.startsWith(regionPrefix));

  const targetTenantIds: string[] = user.organizations.map(
    (org: Organization) => tenantExternalId(org.id, region),
  );

  const toRemove: string[] = existingTenantIdsInRegion.filter(
    (id: string) => !targetTenantIds.includes(id),
  );
  const toAdd: string[] = targetTenantIds.filter(
    (id: string) => !existingTenantIdsInRegion.includes(id),
  );

  if (toRemove.length) {
    const r = await client.removeCustomerFromTenants({
      customerIdentifier: { emailAddress: email },
      tenantIdentifiers: toRemove.map((externalId: string) => ({ externalId })),
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
      tenantIdentifiers: toAdd.map((externalId: string) => ({ externalId })),
    });
    if (r.error)
      logger.error("addCustomerToTenants failed", describeSdkError(r.error));
  }
}

// Helper to derive organizationId from projectId and the user's orgs
function deriveOrganizationIdFromProject(
  user: SessionUser,
  projectId?: string,
) {
  if (!projectId || !Array.isArray(user.organizations)) return undefined;
  for (const org of user.organizations) {
    if (org.projects?.some((p) => p.id === projectId)) return org.id;
  }
  return undefined;
}

/** Wrapper that runs all non-critical updates but NEVER throws */
async function safeUpdatePlainAncillaries(params: {
  client: PlainClient;
  user: SessionUser;
  email: string;
  customerId: string;
}) {
  try {
    const region = getCloudRegion();
    const demoOrgId = getDemoOrgId();

    await ensureTenantsAndTiers({
      client: params.client,
      user: params.user,
      region,
      demoOrgId,
    });
    await syncCustomerTenantMemberships({
      client: params.client,
      email: params.email,
      customerId: params.customerId,
      user: params.user,
      region,
    });
  } catch (e) {
    logger.error("safeUpdatePlainAncillaries caught", describeSdkError(e));
  }
}

// =========================
// Router
// =========================
export const plainRouter = createTRPCRouter({
  /**
   * Explicit sync-only route: upserts customer, ensures tenants/tiers, and syncs memberships.
   * Mirrors the old plain.ts behavior while keeping createSupportThread's internal sync.
   */
  updatePlainData: protectedProcedure.mutation(async ({ ctx }) => {
    const client = getPlainClient();

    const email = ctx.session.user.email;
    const fullName = ctx.session.user.name ?? undefined;
    if (!email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User email required for Plain sync.",
      });
    }

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
    const upsertData = unwrap("upsertCustomer", upsert);
    const customerId = upsertData.customer?.id;
    if (!customerId) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Plain did not return a customer id.",
      });
    }

    await safeUpdatePlainAncillaries({
      client,
      user: ctx.session.user as SessionUser,
      email,
      customerId,
    });

    return { customerId, updated: true };
  }),

  /**
   * Creates a thread (critical path) and asynchronously upserts thread fields
   * and runs ancillary updates (tenants, tiers, memberships).
   *
   * Critical path:
   *  (1) Upsert customer
   *  (2) Create thread WITHOUT threadFields
   *
   * Fire-and-forget:
   *  (3) Upsert threadFields (Enum + String)
   *  (4) Ancillary updates (tenants/tiers/memberships)
   */
  createSupportThread: protectedProcedure
    .input(CreateSupportThreadInput)
    .mutation(async ({ ctx, input }) => {
      const client = getPlainClient();

      const email = ctx.session.user.email;
      const fullName = ctx.session.user.name ?? undefined;
      if (!email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User email required to create a support thread.",
        });
      }

      // 1) Upsert customer (critical)
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
      const upsertData = unwrap("upsertCustomer", upsert);
      const customerId = upsertData.customer?.id;
      if (!customerId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Plain did not return a customer id.",
        });
      }

      // 2) Prepare & create thread (WITHOUT fields) — critical
      const derivedOrgId =
        input.organizationId ??
        deriveOrganizationIdFromProject(
          ctx.session.user as SessionUser,
          input.projectId,
        );

      const { all } = buildThreadFields({
        ...input,
        organizationId: derivedOrgId,
        cloudRegion: input.cloudRegion ?? getCloudRegion() ?? undefined,
      });

      const title = `${input.messageType}: ${input.topic}`;
      const components = [{ componentText: { text: input.message } }];

      const created = await client.createThread({
        title,
        customerIdentifier: { emailAddress: email },
        components,
        // No threadFields here — added asynchronously below
      });
      const thread = unwrap("createThread", created);
      const threadId = thread.id;

      // 3) Fire-and-forget: upsert thread fields (Enum + String)
      // Use Promise.allSettled to avoid unhandled rejections; log any errors.
      void (async () => {
        try {
          const tasks = all.map((f) =>
            client
              .upsertThreadField({
                identifier: { key: f.key, threadId },
                type: f.type,
                stringValue: f.stringValue,
              })
              .then((r) => {
                if (r.error) {
                  logger.error(
                    `upsertThreadField failed key=${f.key}`,
                    describeSdkError(r.error),
                  );
                }
              })
              .catch((e) => {
                logger.error(
                  `upsertThreadField threw key=${f.key}`,
                  describeSdkError(e),
                );
              }),
          );
          await Promise.allSettled(tasks);
        } catch (e) {
          // Extremely defensive; we already catch per-task
          logger.error("threadFields upsert batch threw", describeSdkError(e));
        }
      })();

      // 4) Fire-and-forget: ancillary updates (tenants/tiers/memberships)
      void safeUpdatePlainAncillaries({
        client,
        user: ctx.session.user as SessionUser,
        email,
        customerId,
      });

      return {
        threadId,
        customerId,
        status: thread.status,
        createdAt:
          thread.createdAt?.__typename === "DateTime"
            ? thread.createdAt.iso8601
            : undefined,
        // No diagnostics returned; non-critical work is handled asynchronously.
      };
    }),
});
