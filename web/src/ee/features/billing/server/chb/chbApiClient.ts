import { z } from "zod";

import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

/**
 * Thin fetch wrapper for the ClickHouse Billing (CHB) REST API
 * (BIL-5791 §2.1, endpoints BIL-5880/5890–5898).
 *
 * This module is the only place that knows the CHB wire format. The spec says
 * CHB will publish a generated typed client; swapping it in later is a
 * one-file change.
 *
 * TODO(BIL-5791): response schemas below follow the spec discussion but must
 * be reconciled against the final CHB API definitions before rollout. They
 * are deliberately loose (unknown fields ignored, most fields nullish) so
 * additive CHB changes cannot break us.
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
 * active payment method (BIL-5910). Callers translate this into the same
 * "needs checkout" UX path the billing dialog already handles.
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

export const ChbScheduledChangeSchema = z.object({
  type: z.string(), // "upgrade" | "downgrade" | "cancel"
  when: z.string(), // "immediate" | "billing_cycle_end" | ISO date
  planCode: z.string().nullish(),
  startDate: z.string().nullish(),
});
export type ChbScheduledChange = z.infer<typeof ChbScheduledChangeSchema>;

export const ChbBundleSchema = z.object({
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

export const ChbCheckoutSessionSchema = z.object({
  url: z.string(),
  // ClickHouse Organization ID — persisted on the Langfuse org right away so
  // a checkout retry reuses the same CH org (spec §5, checkout recovery).
  organizationId: z.uuid(),
});
export type ChbCheckoutSession = z.infer<typeof ChbCheckoutSessionSchema>;

export const ChbInvoiceSchema = z.object({
  id: z.string().nullish(),
  number: z.string().nullish(),
  status: z.string().nullish(),
  currency: z.string().nullish(),
  createdAt: z.string().nullish(),
  totalCents: z.number().nullish(),
  // Open question (plan §8.3): hosted download URL and draft/upcoming rows
  // are requested but not yet confirmed in the CHB invoice payload.
  downloadUrl: z.string().nullish(),
});
export type ChbInvoice = z.infer<typeof ChbInvoiceSchema>;

const ChbInvoiceListSchema = z.object({
  invoices: z.array(ChbInvoiceSchema).default([]),
});

export const ChbPortalSessionSchema = z.object({
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
  constructor(
    private readonly config: {
      baseUrl: string;
      serviceToken: string;
    },
  ) {}

  private async request(opts: ChbRequestOptions): Promise<unknown> {
    const url = new URL(
      opts.path.replace(/^\//, ""),
      `${this.config.baseUrl.replace(/\/$/, "")}/`,
    );
    for (const [key, value] of Object.entries(opts.searchParams ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: opts.method,
      headers: {
        authorization: `Bearer ${this.config.serviceToken}`,
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
 * Build a client from env, or null when the CHB REST surface is not
 * configured. Callers treat null as "CHB unavailable" and fail closed.
 */
export const createChbApiClientFromEnv = (): ChbApiClient | null => {
  if (
    !env.CLICKHOUSE_BILLING_BASE_URL ||
    !env.CLICKHOUSE_BILLING_SERVICE_TOKEN
  ) {
    return null;
  }
  return new ChbApiClient({
    baseUrl: env.CLICKHOUSE_BILLING_BASE_URL,
    serviceToken: env.CLICKHOUSE_BILLING_SERVICE_TOKEN,
  });
};
