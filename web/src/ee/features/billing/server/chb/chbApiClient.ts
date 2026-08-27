import { z } from "zod";

import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

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
 * CHB returns 409 Conflict on bundle mutations when the organization has no
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

const ChbScheduledChangeSchema = z.object({
  type: z.string(), // "upgrade" | "downgrade" | "cancel"
  when: z.string(), // "immediate" | "billing_cycle_end" | ISO date
  planCode: z.string().nullish(),
  startDate: z.string().nullish(),
});
type ChbScheduledChange = z.infer<typeof ChbScheduledChangeSchema>;

const ChbBundleSchema = z.object({
  id: z.string(),
  plan: z
    .object({
      planCode: z.string().nullish(),
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
      status: z.string().nullish(),
      nextPaymentDate: z.string().nullish(),
      provider: z
        .object({
          customerId: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  scheduled: ChbScheduledChangeSchema.nullish(),
});
export type ChbBundle = z.infer<typeof ChbBundleSchema>;

const ChbCheckoutSessionSchema = z.object({
  url: z.string(),
  // ClickHouse Organization ID — persisted on the Langfuse org right away so a
  // checkout retry recovers the same CH org instead of orphaning one.
  organizationId: z.uuid(),
});
export type ChbCheckoutSession = z.infer<typeof ChbCheckoutSessionSchema>;

const ChbInvoiceSchema = z.object({
  id: z.string().nullish(),
  number: z.string().nullish(),
  status: z.string().nullish(),
  currency: z.string().nullish(),
  createdAt: z.string().nullish(),
  totalCents: z.number().nullish(),
  // Still an open question with CHB: a hosted download URL and draft/upcoming
  // rows are requested but not confirmed in the invoice payload yet.
  downloadUrl: z.string().nullish(),
});
export type ChbInvoice = z.infer<typeof ChbInvoiceSchema>;

const ChbInvoiceListSchema = z.object({
  invoices: z.array(ChbInvoiceSchema).default([]),
});

const ChbPortalSessionSchema = z.object({
  url: z.string(),
});

const REQUEST_TIMEOUT_MS = 15_000;

type ChbRequestOptions = {
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

  private async send(url: URL, opts: ChbRequestOptions): Promise<Response> {
    return await fetch(url, {
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
  }

  private async request(opts: ChbRequestOptions): Promise<unknown> {
    const url = this.requestUrl(opts);

    let response = await this.send(url, opts);
    if (response.status === 401) {
      // CHB rejected a token we still considered fresh — revoked, or the Auth0
      // signing key rotated. A 401 means CHB did no work, and the retry carries
      // the same idempotency key, so replaying once with a new token is safe.
      logger.warn("[CHB API] Token rejected, retrying with a fresh one", {
        method: opts.method,
        path: opts.path,
      });
      this.tokenProvider.invalidate();
      response = await this.send(url, opts);
    }

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
      method: "POST",
      path: "checkout-sessions",
      body: {
        ...(params.organizationId
          ? { organizationId: params.organizationId }
          : {}),
        email: params.email,
        planCode: params.planCode,
        returnUrl: params.returnUrl,
        ...(params.idempotencyKey
          ? { idempotencyKey: params.idempotencyKey }
          : {}),
      },
      idempotencyKey: params.idempotencyKey,
    });
    return ChbCheckoutSessionSchema.parse(body);
  }

  async getBundle(params: {
    chOrganizationId: string;
    bundleId: string;
  }): Promise<ChbBundle> {
    const body = await this.request({
      method: "GET",
      path: `bundles/${encodeURIComponent(params.bundleId)}`,
      chOrganizationId: params.chOrganizationId,
      searchParams: { fields: "plan,period,payment,scheduled" },
    });
    return ChbBundleSchema.parse(body);
  }

  /** Schedule an upgrade / downgrade / cancellation on a bundle (202). */
  async setScheduledChange(params: {
    chOrganizationId: string;
    bundleId: string;
    change: {
      type: "upgrade" | "downgrade" | "cancel";
      when: "immediate" | "billing_cycle_end";
      planCode?: string;
    };
    idempotencyKey?: string;
  }): Promise<void> {
    await this.request({
      method: "PUT",
      path: `bundles/${encodeURIComponent(params.bundleId)}/scheduled`,
      chOrganizationId: params.chOrganizationId,
      body: params.change,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /** Clear a pending scheduled change — reactivate / undo plan switch (202). */
  async clearScheduledChange(params: {
    chOrganizationId: string;
    bundleId: string;
    idempotencyKey?: string;
  }): Promise<void> {
    await this.request({
      method: "DELETE",
      path: `bundles/${encodeURIComponent(params.bundleId)}/scheduled`,
      chOrganizationId: params.chOrganizationId,
      idempotencyKey: params.idempotencyKey,
    });
  }

  async listInvoices(params: {
    chOrganizationId: string;
    bundleId: string;
  }): Promise<ChbInvoice[]> {
    const body = await this.request({
      method: "GET",
      path: "invoices",
      chOrganizationId: params.chOrganizationId,
      searchParams: { bundleId: params.bundleId },
    });
    return ChbInvoiceListSchema.parse(body).invoices;
  }

  async createPortalSession(params: {
    chOrganizationId: string;
    returnUrl: string;
  }): Promise<string> {
    const body = await this.request({
      method: "POST",
      path: "portal-sessions",
      chOrganizationId: params.chOrganizationId,
      body: { returnUrl: params.returnUrl },
    });
    return ChbPortalSessionSchema.parse(body).url;
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
