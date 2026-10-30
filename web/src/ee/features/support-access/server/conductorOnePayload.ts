import { z } from "zod/v4";

export const C1_TEST_EVENT = "c1.webhooks.v1.PayloadTest";
export const C1_PROVISION_EVENT = "c1.webhooks.v1.PayloadProvisionStep";

export type GrantRequest = {
  action: "grant";
  taskId: string;
  entitlementId: string;
  email: string;
  orgId: string;
  durationMs: number | null;
};
export type RevokeRequest = {
  action: "revoke";
  taskId: string;
  entitlementId: string;
  email: string;
};
export type SupportAccessRequest = GrantRequest | RevokeRequest;

// C1 assigns form field ids itself; this is the "Langfuse Form" field holding
// the organization id. C1 sends submitted form values in `task.data`, keyed by
// field id.
const ORG_ID_FORM_FIELD = "langfuse_organization_id_0";

// https://www.c1.ai/docs/api-reference/task/get
const ProvisionPayloadSchema = z.object({
  taskView: z.object({
    task: z.object({
      id: z.string().min(1),
      userId: z.string().min(1),
      type: z.object({
        grant: z
          .object({
            appEntitlementId: z.string(),
            grantDuration: z.string().nullish(),
          })
          .nullish(),
        revoke: z.object({ appEntitlementId: z.string() }).nullish(),
      }),
      data: z
        .object({ [ORG_ID_FORM_FIELD]: z.string().min(1).optional() })
        .nullish(),
    }),
  }),
  expanded: z
    .array(
      z.looseObject({
        "@type": z.string().optional(),
        id: z.string().optional(),
      }),
    )
    .nullish(),
});

type ProvisionPayload = z.infer<typeof ProvisionPayloadSchema>;

const EnvelopeSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal(C1_TEST_EVENT) }),
  z.object({
    event: z.literal(C1_PROVISION_EVENT),
    payload: ProvisionPayloadSchema,
  }),
]);

function findRequesterEmail(payload: ProvisionPayload): string | null {
  const userId = payload.taskView.task.userId;
  const c1User = payload.expanded?.find(
    (obj) => obj["@type"]?.endsWith("c1.api.user.v1.User") && obj.id === userId,
  );
  const email = z.email().safeParse(c1User?.email);
  return email.success ? email.data.toLowerCase() : null;
}

// protobuf Duration JSON, e.g. "43200s" or "1.5s".
function parseDurationMs(duration: string | null | undefined): number | null {
  const seconds = duration?.match(/^(\d+(?:\.\d+)?)s$/)?.[1];
  return seconds ? Math.round(Number(seconds) * 1000) : null;
}

export function parseConductorOneEnvelope(rawBody: Buffer) {
  try {
    const json: unknown = JSON.parse(rawBody.toString("utf8"));
    return EnvelopeSchema.safeParse(json).data ?? null;
  } catch {
    return null;
  }
}

export function parseProvisionPayload(
  payload: ProvisionPayload,
): SupportAccessRequest | null {
  const { task } = payload.taskView;
  const { grant, revoke } = task.type;
  const email = findRequesterEmail(payload);
  if (!email) return null;

  if (grant) {
    const orgId = task.data?.[ORG_ID_FORM_FIELD];
    if (!orgId) return null;
    return {
      action: "grant",
      taskId: task.id,
      entitlementId: grant.appEntitlementId,
      email,
      orgId,
      durationMs: parseDurationMs(grant.grantDuration),
    };
  }
  if (revoke) {
    return {
      action: "revoke",
      taskId: task.id,
      entitlementId: revoke.appEntitlementId,
      email,
    };
  }
  return null;
}
