import { z } from "zod/v4";

export const C1_TEST_EVENT = "c1.webhooks.v1.PayloadTest";
export const C1_PROVISION_EVENT = "c1.webhooks.v1.PayloadProvisionStep";

export type GrantRequest = {
  action: "grant";
  taskId: string;
  entitlementId: string;
  email: string;
  region: string;
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

const EnvelopeSchema = z.object({ event: z.string(), payload: z.unknown() });

// https://www.c1.ai/docs/api-reference/task/get
// TODO: confirm `task.form.data` against a real C1 payload.
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
      form: z
        .object({
          data: z
            .object({
              langfuse_region: z.string(),
              langfuse_organization_id: z.string(),
            })
            .nullish(),
        })
        .nullish(),
    }),
  }),
  expanded: z
    .array(z.looseObject({ "@type": z.string(), id: z.string().optional() }))
    .nullish(),
});

type ProvisionPayload = z.infer<typeof ProvisionPayloadSchema>;

function findRequesterEmail(payload: ProvisionPayload): string | null {
  const userId = payload.taskView.task.userId;
  const c1User = payload.expanded?.find(
    (obj) => obj["@type"].endsWith("c1.api.user.v1.User") && obj.id === userId,
  );
  const email = z.email().safeParse(c1User?.email);
  return email.success ? email.data.toLowerCase() : null;
}

// C1 sends durations like "43200s".
function parseDurationMs(duration: string | null | undefined): number | null {
  const seconds = duration?.match(/^(\d+)s$/)?.[1];
  return seconds ? Number(seconds) * 1000 : null;
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
  payload: unknown,
): SupportAccessRequest | null {
  const parsed = ProvisionPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const { task } = parsed.data.taskView;
  const { grant, revoke } = task.type;
  const email = findRequesterEmail(parsed.data);
  if (!email) return null;

  if (grant && !revoke) {
    const form = task.form?.data;
    if (!form) return null;
    return {
      action: "grant",
      taskId: task.id,
      entitlementId: grant.appEntitlementId,
      email,
      region: form.langfuse_region,
      orgId: form.langfuse_organization_id,
      durationMs: parseDurationMs(grant.grantDuration),
    };
  }
  if (revoke && !grant) {
    return {
      action: "revoke",
      taskId: task.id,
      entitlementId: revoke.appEntitlementId,
      email,
    };
  }
  return null;
}
