import { z } from "zod";
import { SpanKind } from "@opentelemetry/api";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import { cloudConfigPlans, planLabels, type Plan } from "@langfuse/shared";
import {
  instrumentAsync,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

/**
 * SFDC sync via Mulesoft (Langfuse Cloud only).
 *
 * Two endpoints, four logical events:
 *   - `/manage-user` — upsertUser (lead/contact) on user signup
 *   - org endpoint  — upsertOrg (type:"updateOrg") on org create and on plan
 *                     changes (Stripe webhook). Mulesoft ignores user fields
 *                     on updateOrg, so the payload is org-only; members are
 *                     linked exclusively via setUserRole.
 *                   — setUserRole (type:"setUserRole") on member add or role change
 *                     (a NONE role is synced as removeUser instead)
 *                   — removeUser  (type:"removeUser")  on member removal
 *
 * Every payload carries `isLangfuse: true` to distinguish Langfuse traffic.
 * Date formats follow the SFDC field types behind the Mulesoft mapping
 * (which passes values through verbatim and falls back to `now` when a date
 * field is absent):
 *   - user `createdAt` — ISO-8601 UTC seconds precision
 *     (`YYYY-MM-DDThh:mm:ssZ`); the Lead field accepts datetimes.
 *   - org `createdAt` / `convertedToPaidAt` — date-only (`YYYY-MM-DD`); the
 *     org fields are SFDC Date-typed and reject datetimes with
 *     INVALID_TYPE_ON_FIELD_IN_RECORD.
 *
 * Contract for callers: every public method is fire-and-forget safe.
 * Methods NEVER throw/reject — missing emails, NONE roles, validation
 * failures, HTTP errors, timeouts, and persistence errors are all handled
 * internally with a structured log line. Call sites therefore need no
 * null-checks beyond the factory and no try/catch:
 *
 *     await getSfdcService()?.setUserRole({ orgId, userId, email, role });
 *
 * The factory returns null when any MULESOFT_SFDC_* env var is missing or
 * when not on Cloud — unsetting an env var is the kill switch.
 */

/**
 * Langfuse org roles accepted as input. NONE (project-only membership) is
 * never sent as a role — `setUserRole` syncs it as a removal instead, since
 * a NONE member must hold no org-member bridge in SFDC.
 */
const LangfuseRole = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"]);
export type LangfuseRole = z.infer<typeof LangfuseRole>;

// The SFDC org-member role picklist allows only ADMIN and DEVELOPER.
const LANGFUSE_TO_SFDC_ROLE = {
  OWNER: "ADMIN",
  ADMIN: "ADMIN",
  MEMBER: "DEVELOPER",
  VIEWER: "DEVELOPER",
} as const;

/**
 * SFDC Lead Source picklist values for Langfuse leads. Mulesoft passes them
 * to the SFDC Lead Source field verbatim: signup = organic account creation,
 * invite = user pulled in by an existing org (pending invitation at signup,
 * SCIM provisioning).
 */
const SFDC_LEAD_SOURCES = [
  "Langfuse Cloud Signup",
  "Langfuse Cloud Invite",
] as const;
export type SfdcLeadSource = (typeof SFDC_LEAD_SOURCES)[number];

/**
 * SFDC tier picklist (`Langfuse_Active_Plan__c`) — identical to the
 * `cloudConfig.plan` values, so the shared constant is the schema source.
 */
export type SfdcPlan = (typeof cloudConfigPlans)[number];

/**
 * Map a resolved entitlement plan to the SFDC tier picklist value. Returns
 * null for non-cloud plans (oss / self-hosted), which have no SFDC tier —
 * callers should skip the sync in that case (cannot happen on Cloud, where
 * this service is the only way to reach Mulesoft).
 */
export function toSfdcPlan(plan: Plan): SfdcPlan | null {
  const label = planLabels[plan];
  return (cloudConfigPlans as readonly string[]).includes(label)
    ? (label as SfdcPlan)
    : null;
}

/** Datetime-accepting SFDC fields: ISO-8601 UTC, seconds precision, no millis. */
const toIsoUtcSeconds = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** SFDC Date-typed fields (the org dates) accept only `YYYY-MM-DD` (UTC). */
const toIsoUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

const UpsertUserPayload = z.object({
  userId: z.string().min(1),
  email: z.email(),
  fullName: z.string().min(1),
  companyName: z.string().min(1),
  // -> SFDC "Langfuse Cloud Signup Date" (Langfuse_Signup_Date__c)
  createdAt: z.iso.datetime(),
  leadSource: z.enum(SFDC_LEAD_SOURCES),
});

const SyncableRole = LangfuseRole.exclude(["NONE"]).transform(
  (role) => LANGFUSE_TO_SFDC_ROLE[role],
);

const UpsertOrgPayload = z.object({
  orgId: z.string().min(1),
  orgName: z.string().min(1),
  // -> SFDC "Langfuse Created Date" (Langfuse_Created_Date__c), Date-typed:
  // date-only strings, datetimes are rejected.
  createdAt: z.iso.date(),
  // -> SFDC "Langfuse Tier" (Langfuse_Active_Plan__c)
  plan: z.enum(cloudConfigPlans),
  // -> SFDC "Converted to Paid" (Converted_to_Paid_Date__c), Date-typed.
  // Only sent when the org left Hobby at least once; omitted otherwise so
  // SFDC keeps any previously written value (e.g. across a later downgrade
  // push).
  convertedToPaidAt: z.iso.date().optional(),
});

const SetUserRolePayload = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  email: z.email(),
  role: SyncableRole,
});

const RemoveUserPayload = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  email: z.email(),
});

// Tolerant caller-facing input types: emails may be null/undefined (skipped
// with a log), names may be null/empty (fall back to email), roles may be
// NONE (skipped).
export type UpsertUserInput = {
  userId: string;
  email: string | null | undefined;
  name?: string | null;
  companyName?: string;
  /** User signup timestamp — sent as the SFDC Langfuse Cloud Signup Date. */
  createdAt: Date;
  leadSource: SfdcLeadSource;
};
export type UpsertOrgInput = {
  orgId: string;
  orgName: string;
  /** Org creation timestamp — sent as the SFDC Langfuse Created Date. */
  createdAt: Date;
  plan: SfdcPlan;
  /** First Hobby→paid conversion; omit while the org never converted. */
  convertedToPaidAt?: Date | null;
};
export type SetUserRoleInput = {
  orgId: string;
  userId: string;
  email: string | null | undefined;
  role: LangfuseRole;
};
export type RemoveUserInput = {
  orgId: string;
  userId: string;
  email: string | null | undefined;
};

/**
 * Loose response schema for the org endpoint. Mulesoft returns `sfdcOrgId`
 * on updateOrg; unknown / missing fields are tolerated. The user endpoint
 * (`/manage-user`) acks with a plain-text body and never returns an id.
 */
const SfdcResponse = z.looseObject({
  sfdcOrgId: z.string().optional(),
});

interface SfdcConfig {
  userUrl: string;
  orgUrl: string;
  basicAuthHeader: string;
  dataRegion: string;
}

export class SfdcService {
  private constructor(private readonly config: SfdcConfig) {}

  static tryCreate(): SfdcService | null {
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;
    if (
      !env.MULESOFT_SFDC_USER_URL ||
      !env.MULESOFT_SFDC_ORG_URL ||
      !env.MULESOFT_SFDC_BASIC_AUTH_USER ||
      !env.MULESOFT_SFDC_BASIC_AUTH_PASSWORD
    ) {
      return null;
    }
    const basicAuthHeader =
      "Basic " +
      Buffer.from(
        `${env.MULESOFT_SFDC_BASIC_AUTH_USER}:${env.MULESOFT_SFDC_BASIC_AUTH_PASSWORD}`,
      ).toString("base64");
    return new SfdcService({
      userUrl: env.MULESOFT_SFDC_USER_URL,
      orgUrl: env.MULESOFT_SFDC_ORG_URL,
      basicAuthHeader,
      dataRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    });
  }

  /** Lead / contact upsert on user signup. POSTs to `/manage-user`. */
  async upsertUser(input: UpsertUserInput): Promise<void> {
    return this.run("upsertUser", { userId: input.userId }, async () => {
      if (!input.email) {
        logger.warn("[SFDC] skipping upsertUser — user has no email", {
          userId: input.userId,
        });
        return;
      }
      const parsed = UpsertUserPayload.safeParse({
        userId: input.userId,
        email: input.email,
        fullName: input.name || input.email,
        companyName:
          input.companyName || env.MULESOFT_SFDC_DEFAULT_COMPANY_NAME,
        createdAt: toIsoUtcSeconds(input.createdAt),
        leadSource: input.leadSource,
      });
      if (!parsed.success) {
        logger.warn("[SFDC] invalid upsertUser input — skipping", {
          userId: input.userId,
          error: parsed.error.message,
        });
        return;
      }
      await this.post({
        url: this.config.userUrl,
        payload: { isLangfuse: true, ...parsed.data },
        context: { event: "upsertUser", userId: parsed.data.userId },
        expectJsonResponse: false,
      });
    });
  }

  /**
   * Org upsert on organization create and on plan changes. POSTs to the org
   * endpoint. Carries no user fields (Mulesoft ignores them on updateOrg) —
   * member links are established exclusively via setUserRole.
   */
  async upsertOrg(input: UpsertOrgInput): Promise<void> {
    return this.run("upsertOrg", { orgId: input.orgId }, async () => {
      const parsed = UpsertOrgPayload.safeParse({
        orgId: input.orgId,
        orgName: input.orgName,
        createdAt: toIsoUtcDate(input.createdAt),
        plan: input.plan,
        ...(input.convertedToPaidAt
          ? { convertedToPaidAt: toIsoUtcDate(input.convertedToPaidAt) }
          : {}),
      });
      if (!parsed.success) {
        logger.warn("[SFDC] invalid upsertOrg input — skipping", {
          orgId: input.orgId,
          error: parsed.error.message,
        });
        return;
      }
      const response = await this.post({
        url: this.config.orgUrl,
        payload: {
          isLangfuse: true,
          type: "updateOrg" as const,
          langfuseDataRegion: this.config.dataRegion,
          // The Mulesoft updateOrg flow runs `numServices* > 0` comparisons
          // and 500s on null — always send 0
          numServicesAws: 0,
          numServicesGcp: 0,
          numServicesAzure: 0,
          ...parsed.data,
        },
        context: { event: "upsertOrg", orgId: parsed.data.orgId },
      });
      if (response?.sfdcOrgId) {
        await this.persistSfdcOrgId(parsed.data.orgId, response.sfdcOrgId);
      }
    });
  }

  /**
   * Set or update a user's role within an org. Fires on membership creation
   * (invite accept, admin add, SCIM provision) and on role changes. A NONE
   * role (project-only membership) means SFDC must hold no org-member bridge
   * for the user, so it is synced as a removal — that covers downgrades of
   * existing members.
   */
  async setUserRole(input: SetUserRoleInput): Promise<void> {
    if (input.role === "NONE") {
      return this.removeUser({
        orgId: input.orgId,
        userId: input.userId,
        email: input.email,
      });
    }
    return this.run(
      "setUserRole",
      { orgId: input.orgId, userId: input.userId },
      async () => {
        if (!input.email) {
          logger.warn("[SFDC] skipping setUserRole — user has no email", {
            orgId: input.orgId,
            userId: input.userId,
          });
          return;
        }
        const parsed = SetUserRolePayload.safeParse(input);
        if (!parsed.success) {
          logger.warn("[SFDC] invalid setUserRole input — skipping", {
            orgId: input.orgId,
            userId: input.userId,
            error: parsed.error.message,
          });
          return;
        }
        await this.post({
          url: this.config.orgUrl,
          payload: {
            isLangfuse: true,
            type: "setUserRole" as const,
            ...parsed.data,
          },
          context: {
            event: "setUserRole",
            orgId: parsed.data.orgId,
            userId: parsed.data.userId,
          },
          expectJsonResponse: false,
        });
      },
    );
  }

  /** Remove a user from an org. Fires on membership deletion. */
  async removeUser(input: RemoveUserInput): Promise<void> {
    return this.run(
      "removeUser",
      { orgId: input.orgId, userId: input.userId },
      async () => {
        if (!input.email) {
          logger.warn("[SFDC] skipping removeUser — user has no email", {
            orgId: input.orgId,
            userId: input.userId,
          });
          return;
        }
        const parsed = RemoveUserPayload.safeParse(input);
        if (!parsed.success) {
          logger.warn("[SFDC] invalid removeUser input — skipping", {
            orgId: input.orgId,
            userId: input.userId,
            error: parsed.error.message,
          });
          return;
        }
        await this.post({
          url: this.config.orgUrl,
          payload: {
            isLangfuse: true,
            type: "removeUser" as const,
            ...parsed.data,
          },
          context: {
            event: "removeUser",
            orgId: parsed.data.orgId,
            userId: parsed.data.userId,
          },
          expectJsonResponse: false,
        });
      },
    );
  }

  /**
   * Belt-and-braces never-throw wrapper around every public method body so
   * the fire-and-forget contract holds even for unforeseen errors. Wraps the
   * operation in one `sfdc.<event>` span; because errors never propagate to
   * callers, this span (marked errored via traceException) is the only place
   * failed syncs surface in APM.
   */
  private async run(
    event: string,
    context: Record<string, unknown>,
    fn: () => Promise<void>,
  ): Promise<void> {
    return instrumentAsync(
      { name: `sfdc.${event}`, spanKind: SpanKind.CLIENT },
      async (span) => {
        for (const [key, value] of Object.entries(context)) {
          if (typeof value === "string") {
            span.setAttribute(`sfdc.${key}`, value);
          }
        }
        try {
          await fn();
        } catch (err) {
          traceException(err, span);
          logger.error(`[SFDC] ${event} failed unexpectedly`, {
            ...context,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
  }

  /**
   * Single POST helper. Returns the parsed response on 2xx, null otherwise.
   * Never throws — HTTP errors, timeouts, and malformed bodies are logged.
   * Every request leaves exactly one outcome log line (info on 2xx, warn
   * otherwise) so each Mulesoft call is auditable in the log stream. At
   * debug level, every call additionally logs its full request payload
   * before send and the full raw response body once received.
   */
  private async post(args: {
    url: string;
    payload: Record<string, unknown>;
    context: Record<string, unknown>;
    /** The user endpoint acks with plain text — set false to skip JSON parsing. */
    expectJsonResponse?: boolean;
  }): Promise<z.infer<typeof SfdcResponse> | null> {
    const { url, payload, context, expectJsonResponse = true } = args;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      env.MULESOFT_SFDC_REQUEST_TIMEOUT_MS,
    );
    const startTime = Date.now();

    logger.debug("[SFDC] Mulesoft request payload", {
      ...context,
      url,
      payload,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.config.basicAuthHeader,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseText = await response.text().catch(() => "");
      logger.debug("[SFDC] Mulesoft response body", {
        ...context,
        url,
        status: response.status,
        responseBody: responseText,
      });

      if (!response.ok) {
        traceException(new Error(`Mulesoft returned ${response.status}`));
        logger.error("[SFDC] Mulesoft returned non-2xx", {
          ...context,
          url,
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startTime,
          responseBody: responseText.slice(0, 500),
        });
        return null;
      }

      logger.info("[SFDC] Mulesoft request succeeded", {
        ...context,
        url,
        status: response.status,
        durationMs: Date.now() - startTime,
      });

      // Tolerate empty / non-JSON bodies; we only care if an ID comes back.
      if (!expectJsonResponse || !responseText) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        logger.warn("[SFDC] Mulesoft returned non-JSON body", {
          ...context,
          responseBody: responseText.slice(0, 500),
        });
        return null;
      }

      const result = SfdcResponse.safeParse(parsed);
      if (!result.success) {
        logger.warn("[SFDC] unexpected Mulesoft response shape", {
          ...context,
          error: result.error.message,
        });
        return null;
      }
      return result.data;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      traceException(err);
      logger.error(
        isAbort
          ? "[SFDC] Mulesoft request timed out"
          : "[SFDC] Mulesoft request failed",
        {
          ...context,
          url,
          durationMs: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Persist the returned sfdcOrgId on the Organization row. Logs an error on
   * mismatch with an existing value (SFDC-side merge) but does NOT throw —
   * we don't want to trigger any retry loop because the upstream call
   * already succeeded.
   */
  private async persistSfdcOrgId(
    orgId: string,
    sfdcOrgId: string,
  ): Promise<void> {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { sfdcOrgId: true },
      });
      if (org?.sfdcOrgId && org.sfdcOrgId !== sfdcOrgId) {
        logger.error(
          "[SFDC] sfdcOrgId changed for existing org (SFDC-side merge?)",
          {
            orgId,
            existingSfdcOrgId: org.sfdcOrgId,
            returnedSfdcOrgId: sfdcOrgId,
          },
        );
      }
      if (!org?.sfdcOrgId) {
        await prisma.organization.update({
          where: { id: orgId },
          data: { sfdcOrgId },
        });
      }
    } catch (err) {
      logger.error("[SFDC] failed to persist sfdcOrgId", {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

let cached: SfdcService | null | undefined;

/**
 * Module-level cached factory. Returns null when the integration is not
 * configured (self-hosted, local dev, or any env var missing). Combined with
 * the never-throw method contract, call sites reduce to:
 *
 *     await getSfdcService()?.upsertUser({ userId, email, name });
 */
export function getSfdcService(): SfdcService | null {
  if (cached === undefined) {
    cached = SfdcService.tryCreate();
  }
  return cached;
}

/** Test-only helper to reset the module-level cache between cases. */
export function resetSfdcServiceCacheForTests(): void {
  cached = undefined;
}
