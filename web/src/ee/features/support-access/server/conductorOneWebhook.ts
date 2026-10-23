import { createHash } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { getSsoAuthProviderIdForDomain } from "@/src/ee/features/multi-tenant-sso/server";
import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import { SupportAccessSchema, type SupportAccessEntry } from "./supportAccess";

// ConductorOne webhooks: https://www.c1.ai/docs/product/admin/webhooks
// Each request carries a JWT signed by our C1 tenant, valid for two minutes,
// whose `aud` is the target hostname and whose `htb_s256` is the body hash.
const SUPPORT_EMAIL_DOMAIN = "clickhouse.com";
const MAX_GRANT_MS = 12 * 60 * 60 * 1000;

// The provisioning payload is the C1 GetTask response plus expanded objects.
// The request form location (`task.form.data`) is not documented; verify it
// against a real payload. Anything that does not match is rejected.
export const ProvisionPayloadSchema = z.object({
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
type C1Response = {
  version: "v1";
  complete?: { comment: string };
  errored?: { comment: string };
};

const complete = (comment: string): C1Response => ({
  version: "v1",
  complete: { comment },
});
const errored = (comment: string): C1Response => ({
  version: "v1",
  errored: { comment },
});

function audit(
  action: "grant" | "revoke",
  userId: string,
  orgId: string,
  after: unknown,
) {
  return auditLog({
    userId: "conductorone-webhook",
    orgId,
    resourceType: "supportAccess",
    resourceId: userId,
    action,
    after,
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

let jwks: JWTVerifyGetKey | undefined;

/**
 * Throws unless the bearer JWT is signed by our C1 tenant, unexpired, issued
 * for this host and for exactly this body.
 */
export async function verifyConductorOneRequest(
  authorization: string | undefined,
  rawBody: Buffer,
  config: { issuer: string; audience: string; jwks: JWTVerifyGetKey },
) {
  const [scheme, token] = (authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) throw new Error("Missing bearer token");

  const { payload } = await jwtVerify(token, config.jwks, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["RS256", "ES256", "EdDSA"],
    requiredClaims: ["exp", "htb_s256"],
  });

  const bodyHash = createHash("sha256").update(rawBody).digest();
  // Documented as base64; base64url encodes the same hash.
  if (
    payload.htb_s256 !== bodyHash.toString("base64") &&
    payload.htb_s256 !== bodyHash.toString("base64url")
  ) {
    throw new Error("Body hash mismatch");
  }
}

export async function handleProvisionTask(
  payload: ProvisionPayload,
  config: { entitlementId: string; region: string },
  now: Date = new Date(),
): Promise<C1Response> {
  const { task } = payload.taskView;
  const { grant, revoke } = task.type;
  const target = grant ?? revoke;
  if (!target || (grant && revoke)) return errored("Unsupported task type");
  if (target.appEntitlementId !== config.entitlementId) {
    return errored("Entitlement is not handled by this Langfuse region");
  }

  const c1User = payload.expanded?.find(
    (obj) =>
      obj["@type"].endsWith("c1.api.user.v1.User") && obj.id === task.userId,
  );
  const email = z.email().safeParse(c1User?.email).data?.toLowerCase();
  if (!email) return errored("Requester email not found in task");

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      password: true,
      supportAccess: true,
      accounts: { select: { provider: true } },
    },
  });

  if (revoke) {
    // Clears every grant: C1 tracks one entitlement per user.
    if (!user) return complete("No Langfuse user, nothing to revoke");
    const previous = SupportAccessSchema.safeParse(user.supportAccess ?? {});
    await prisma.user.update({
      where: { id: user.id },
      data: { supportAccess: Prisma.DbNull },
    });
    for (const orgId of Object.keys(previous.data ?? {})) {
      await audit("revoke", user.id, orgId, { c1TaskId: task.id });
    }
    return complete("Support access revoked");
  }

  const form = task.form?.data;
  if (form?.langfuse_region !== config.region) {
    return errored(`Request is not for region ${config.region}`);
  }
  const durationSeconds = Number(
    /^(\d+)s$/.exec(grant!.grantDuration ?? "")?.[1],
  );
  if (!durationSeconds || durationSeconds * 1000 > MAX_GRANT_MS) {
    return errored("Grant must be time-bound to at most 12h");
  }
  if (!email.endsWith(`@${SUPPORT_EMAIL_DOMAIN}`)) {
    return errored("Requester email domain is not allowed");
  }
  // A user row alone does not prove who controls the email (SCIM, password
  // sign-up and some OAuth providers can create one for any address). Require
  // a login through the SSO provider that sign-in enforces for the domain.
  const ssoProvider = await getSsoAuthProviderIdForDomain(SUPPORT_EMAIL_DOMAIN);
  if (
    !user ||
    !ssoProvider ||
    user.password !== null ||
    !user.accounts.some((account) => account.provider === ssoProvider)
  ) {
    return errored("Sign in to this Langfuse region via SSO once, then retry");
  }

  const org = await prisma.organization.findUnique({
    where: { id: form.langfuse_organization_id },
    select: { id: true },
  });
  if (!org) return errored("Organization not found in this region");

  const existing = SupportAccessSchema.safeParse(user.supportAccess ?? {});
  if (existing.data?.[org.id]?.c1TaskId === task.id) {
    return complete("Support access already granted");
  }

  const entry: SupportAccessEntry = {
    role: "VIEWER",
    expiresAt: new Date(now.getTime() + durationSeconds * 1000).toISOString(),
    c1TaskId: task.id,
  };
  // Atomic merge so concurrent grants for different orgs don't overwrite
  // each other.
  await prisma.$executeRaw`
    UPDATE users
    SET support_access = COALESCE(support_access, '{}'::jsonb)
      || jsonb_build_object(${org.id}::text, ${JSON.stringify(entry)}::jsonb)
    WHERE id = ${user.id}`;
  await audit("grant", user.id, org.id, entry);

  return complete(`VIEWER access granted until ${entry.expiresAt}`);
}

/** POST /api/support-access/conductorone-webhook */
export async function conductorOneWebhookHandler(req: NextRequest) {
  const issuer = env.LANGFUSE_CONDUCTORONE_ISSUER;
  const entitlementId = env.LANGFUSE_CONDUCTORONE_ENTITLEMENT_ID;
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  if (!issuer || !entitlementId || !region || !env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The bytes as received: the JWT signs a hash of the exact body.
  const rawBody = Buffer.from(await req.arrayBuffer());
  try {
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`https://${issuer}/auth/v1/jwks`));
    }
    await verifyConductorOneRequest(
      req.headers.get("authorization") ?? undefined,
      rawBody,
      { issuer, audience: new URL(env.NEXTAUTH_URL).hostname, jwks },
    );
  } catch (error) {
    logger.warn("ConductorOne webhook rejected", {
      reason: (error as Error).message,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = z
    .object({ event: z.string(), payload: z.unknown() })
    .safeParse(parseJson(rawBody.toString("utf8")));
  if (body.data?.event === "c1.webhooks.v1.PayloadTest") {
    return NextResponse.json({ version: "v1" });
  }
  if (body.data?.event !== "c1.webhooks.v1.PayloadProvisionStep") {
    return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  }
  const payload = ProvisionPayloadSchema.safeParse(body.data.payload);
  if (!payload.success) {
    // Permanent: errored makes C1 fall back to manual provisioning.
    return NextResponse.json(errored("Unrecognized provisioning payload"));
  }

  try {
    return NextResponse.json(
      await handleProvisionTask(payload.data, { entitlementId, region }),
    );
  } catch (error) {
    logger.error("ConductorOne provisioning task failed", error);
    // Transient: non-2xx makes C1 retry.
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
