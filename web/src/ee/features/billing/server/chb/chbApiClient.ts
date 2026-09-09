import { randomUUID } from "crypto";

import { SpanKind, type Span } from "@opentelemetry/api";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { instrumentAsync, logger } from "@langfuse/shared/src/server";

import {
  ChbAccessTokenProvider,
  type ChbAccessTokenConfig,
} from "./chbAccessToken";

/**
 * Thin fetch wrapper for the ClickHouse Billing (CHB) REST API.
 */

export class ChbApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ChbApiError";
  }
}

/**
 * CHB returns 409 Conflict on attached-plan mutations when the organization has no
 * active payment method. Callers translate this into the same "needs checkout"
 * UX path the billing dialog already handles.
 */
export class ChbPaymentRequiredError extends ChbApiError {
  constructor(body?: unknown) {
    super(
      "CHB rejected the mutation: no active payment method on the organization",
      409,
      body,
    );
    this.name = "ChbPaymentRequiredError";
  }
}

// A pending change on the attached plan, as GET /attachedplan reports it.
// Kept permissive (no discriminated union) because this is a read path that
// renders the billing page: an unknown type must degrade, not throw.
const ChbAttachedPlanScheduledSchema = z.object({
  type: z.string(), // "upgrade" | "downgrade" | "cancel"
  planCode: z.string().nullish(), // upgrade / downgrade target
  startDate: z.string().nullish(), // upgrade / downgrade effective date
  endDate: z.string().nullish(), // cancel: when the plan ends
});

const ChbAttachedPlanSchema = z.object({
  id: z.string(),
  plan: z
    .object({
      code: z.string().nullish(),
    })
    .nullish(),
  period: z
    .object({
      startDate: z.string().nullish(),
      endDate: z.string().nullish(),
    })
    .nullish(),
  payment: z
    .object({
      status: z.string().nullish(), // "active" | "past-due" | "failed"
      provider: z
        .object({
          name: z.string().nullish(),
          customerId: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  scheduled: ChbAttachedPlanScheduledSchema.nullish(),
});
export type ChbAttachedPlan = z.infer<typeof ChbAttachedPlanSchema>;

const ChbCheckoutSessionSchema = z.object({
  checkoutUrl: z.url(),
  // ClickHouse Organization ID — persisted on the Langfuse org right away so a
  // checkout retry recovers the same CH org instead of orphaning one.
  organizationId: z.uuid(),
});
export type ChbCheckoutSession = z.infer<typeof ChbCheckoutSessionSchema>;

const ChbInvoiceSchema = z.object({
  id: z.string().nullish(),
  number: z.string().nullish(),
  status: z.string().nullish(), // "draft" | "open" | "paid" | "void" | "uncollectible"
  currency: z.string().nullish(),
  createdAt: z.string().nullish(),
  // Minor units (cents for USD)
  amount: z.number().nullish(),
  hostedUrl: z.string().nullish(),
  pdfUrl: z.string().nullish(),
});
export type ChbInvoice = z.infer<typeof ChbInvoiceSchema>;

const ChbInvoiceListSchema = z.object({
  invoices: z.array(ChbInvoiceSchema).default([]),
});

const ChbPortalSessionSchema = z.object({
  portalUrl: z.string(),
});

const REQUEST_TIMEOUT_MS = 15_000;

type ChbRequestOptions = {
  /**
   * APM span name for the CHB operation, e.g. `chb.checkout_session.create`.
   * Named after the operation rather than the route so a path carrying an id
   * does not fan one operation out into unrelated APM resources.
   */
  operation: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  /** CH-Organization-Id header — required for org-scoped endpoints */
  chOrganizationId?: string;
  body?: unknown;
  idempotencyKey?: string;
  searchParams?: Record<string, string>;
};

export class ChbApiClient {
  private readonly tokenProvider: ChbAccessTokenProvider;

  constructor(
    private readonly config: {
      baseUrl: string;
      auth: ChbAccessTokenConfig;
    },
  ) {
    this.tokenProvider = new ChbAccessTokenProvider(config.auth);
  }

  private requestUrl(opts: ChbRequestOptions): URL {
    // Relative join against a trailing slash, so a base url carrying a path
    // prefix keeps it instead of having it replaced.
    const url = new URL(
      opts.path.replace(/^\//, ""),
      `${this.config.baseUrl.replace(/\/$/, "")}/`,
    );
    for (const [key, value] of Object.entries(opts.searchParams ?? {})) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  /**
   * One span per HTTP attempt, so a token replay shows as two attempt spans —
   * each with the token mint it triggered nested underneath — rather than as
   * one opaque slow call.
   */
  private async send(
    url: URL,
    opts: ChbRequestOptions,
    attempt: number,
  ): Promise<Response> {
    return await instrumentAsync(
      { name: "chb.api.request", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttributes({
          "http.method": opts.method,
          "http.route": opts.path,
          "peer.hostname": url.hostname,
          "chb.operation": opts.operation,
          "chb.attempt": attempt,
        });

        const response = await fetch(url, {
          method: opts.method,
          headers: {
            authorization: `Bearer ${await this.tokenProvider.getToken()}`,
            ...(opts.chOrganizationId
              ? { "CH-Organization-Id": opts.chOrganizationId }
              : {}),
            ...(opts.body !== undefined
              ? { "content-type": "application/json" }
              : {}),
            ...(opts.idempotencyKey
              ? { "Idempotency-Key": opts.idempotencyKey }
              : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          // The base URL is operator-configured; an unexpected redirect is an
          // error, not something to follow with a bearer token attached.
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        span.setAttribute("http.status_code", response.status);
        return response;
      },
    );
  }

  private async request(opts: ChbRequestOptions): Promise<unknown> {
    const outcome = await instrumentAsync(
      { name: opts.operation, spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttributes({
          "http.method": opts.method,
          "http.route": opts.path,
          ...(opts.chOrganizationId
            ? { "chb.ch_organization_id": opts.chOrganizationId }
            : {}),
          ...(opts.idempotencyKey
            ? { "chb.idempotency_key": opts.idempotencyKey }
            : {}),
        });

        try {
          return {
            thrown: undefined,
            body: await this.sendWithReplay(opts, span),
          };
        } catch (error) {
          // A 409 is the "organization needs a payment method" UX branch, not
          // an incident — which is why it is deliberately not logged as an
          // error either. Carrying it out of the span instead of throwing
          // through it keeps instrumentAsync from marking the operation as an
          // APM error, so a routine checkout prompt cannot inflate the error
          // rate this instrumentation exists to make readable.
          if (error instanceof ChbPaymentRequiredError) {
            span.setAttribute("chb.payment_required", true);
            return { thrown: error, body: undefined };
          }
          throw error;
        }
      },
    );

    // Rethrown outside the span so the caller contract is unchanged.
    if (outcome.thrown) throw outcome.thrown;
    return outcome.body;
  }

  private async sendWithReplay(
    opts: ChbRequestOptions,
    span: Span,
  ): Promise<unknown> {
    const url = this.requestUrl(opts);

    let response = await this.send(url, opts, 1);
    if (response.status === 401) {
      // CHB rejected a token we still considered fresh — revoked, or the Auth0
      // signing key rotated. A 401 means CHB did no work, and the retry carries
      // the same idempotency key, so replaying once with a new token is safe.
      logger.warn("[CHB API] Token rejected, retrying with a fresh one", {
        method: opts.method,
        path: opts.path,
      });
      span.setAttribute("chb.token_replayed", true);
      this.tokenProvider.invalidate();
      response = await this.send(url, opts, 2);
    }

    span.setAttribute("http.status_code", response.status);

    const responseBody = await response
      .json()
      .catch(() => undefined as unknown);

    if (response.status === 409) {
      throw new ChbPaymentRequiredError(responseBody);
    }
    if (!response.ok) {
      logger.error("[CHB API] Request failed", {
        method: opts.method,
        path: opts.path,
        status: response.status,
        body: responseBody,
      });
      throw new ChbApiError(
        `CHB API ${opts.method} ${opts.path} failed with status ${response.status}`,
        response.status,
        responseBody,
      );
    }

    return responseBody;
  }

  async createCheckoutSession(params: {
    organizationId?: string;
    email: string;
    planCode: string;
    returnUrl: string;
    idempotencyKey?: string;
  }): Promise<ChbCheckoutSession> {
    const body = await this.request({
      operation: "chb.checkout_session.create",
      method: "POST",
      path: "checkout-sessions",
      body: {
        ...(params.organizationId
          ? { organizationId: params.organizationId }
          : {}),
        email: params.email,
        planCode: params.planCode,
        returnUrl: params.returnUrl,
        // Required by CHB. Without an opId there is nothing to dedupe against,
        // so a fresh key makes the call unique rather than rejected.
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
      },
      idempotencyKey: params.idempotencyKey,
    });
    return ChbCheckoutSessionSchema.parse(body);
  }

  /**
   * The organization's current attached plan. CHB scopes the attached-plan
   * routes by the CH-Organization-Id header, there is no id in the path; a 404
   * means the organization has none.
   */
  async getAttachedPlan(params: {
    chOrganizationId: string;
  }): Promise<ChbAttachedPlan> {
    const body = await this.request({
      operation: "chb.attachedplan.get",
      method: "GET",
      path: "attachedplan",
      chOrganizationId: params.chOrganizationId,
      searchParams: { fields: "plan,period,payment,scheduled" },
    });
    return ChbAttachedPlanSchema.parse(body);
  }

  /** Upgrade now, schedule a downgrade for the cycle end, or cancel the plan. */
  async setScheduledChange(params: {
    chOrganizationId: string;
    change: {
      type: "upgrade" | "downgrade" | "cancel";
      when: "immediate" | "billing_cycle_end";
      planCode?: string;
    };
    idempotencyKey?: string;
  }): Promise<void> {
    await this.request({
      operation: "chb.attachedplan.scheduled.set",
      method: "PUT",
      path: "attachedplan/scheduled",
      chOrganizationId: params.chOrganizationId,
      body: params.change,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /** Clear a pending scheduled change — reactivate / undo plan switch. */
  async clearScheduledChange(params: {
    chOrganizationId: string;
    idempotencyKey?: string;
  }): Promise<void> {
    await this.request({
      operation: "chb.attachedplan.scheduled.clear",
      method: "DELETE",
      path: "attachedplan/scheduled",
      chOrganizationId: params.chOrganizationId,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Issued invoices, most recent first. Unlike the attached-plan routes this
   * one is scoped by an `organizationId` query parameter.
   */
  async listInvoices(params: {
    chOrganizationId: string;
  }): Promise<ChbInvoice[]> {
    const body = await this.request({
      operation: "chb.invoices.list",
      method: "GET",
      path: "invoices",
      chOrganizationId: params.chOrganizationId,
      searchParams: { organizationId: params.chOrganizationId },
    });
    return ChbInvoiceListSchema.parse(body).invoices;
  }

  async createPortalSession(params: {
    chOrganizationId: string;
    returnUrl: string;
  }): Promise<string> {
    const body = await this.request({
      operation: "chb.portal_session.create",
      method: "POST",
      path: "portal-sessions",
      chOrganizationId: params.chOrganizationId,
      body: { returnUrl: params.returnUrl },
    });
    return ChbPortalSessionSchema.parse(body).portalUrl;
  }
}

/**
 * Build a client from env, or null when the CHB REST surface is not fully
 * configured. Callers treat null as "CHB unavailable" and fail closed — a
 * partially configured deployment must not reach CHB unauthenticated.
 *
 * Exported for the env-validation tests only; call `getChbApiClient` instead,
 * which shares one client (and therefore one token cache) process-wide.
 */
export const buildChbApiClientFromEnv = (): ChbApiClient | null => {
  if (
    !env.CLICKHOUSE_BILLING_BASE_URL ||
    !env.CLICKHOUSE_BILLING_AUTH0_DOMAIN ||
    !env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID ||
    !env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET
  ) {
    return null;
  }
  return new ChbApiClient({
    baseUrl: env.CLICKHOUSE_BILLING_BASE_URL,
    auth: {
      auth0Domain: env.CLICKHOUSE_BILLING_AUTH0_DOMAIN,
      clientId: env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID,
      clientSecret: env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET,
      audience: env.CLICKHOUSE_BILLING_AUTH0_AUDIENCE,
    },
  });
};

class ChbApiClientSingleton {
  private static instance: ChbApiClient | null;
  private static built = false;

  public static getInstance(): ChbApiClient | null {
    if (!ChbApiClientSingleton.built) {
      // Cached even when null: an unconfigured deployment must not re-check
      // env on every billing request either.
      ChbApiClientSingleton.instance = buildChbApiClientFromEnv();
      ChbApiClientSingleton.built = true;
    }
    return ChbApiClientSingleton.instance;
  }

  /** Test-only: drop the cached client so the next call rebuilds from env. */
  public static reset(): void {
    ChbApiClientSingleton.built = false;
    ChbApiClientSingleton.instance = null;
  }
}

/**
 * The CHB client for this process, or null when CHB is not fully configured.
 * Callers treat null as "CHB unavailable" and fail closed.
 */
export const getChbApiClient = (): ChbApiClient | null =>
  ChbApiClientSingleton.getInstance();

/** Test-only: reset the singleton between cases. */
export const resetChbApiClientForTests = (): void =>
  ChbApiClientSingleton.reset();
