import type Stripe from "stripe";
import { TRPCError } from "@trpc/server";

export interface UsageAlertServiceConfig {
  stripeClient?: Stripe;
}

class UsageAlertService {
  private stripeClient: Stripe;

  private static instance: UsageAlertService;

  public static getInstance(
    config: UsageAlertServiceConfig,
  ): UsageAlertService {
    if (!config || !config.stripeClient) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stripe client is required and cannot be empty",
      });
    }
    if (!UsageAlertService.instance) {
      UsageAlertService.instance = new UsageAlertService(config);
    }
    return UsageAlertService.instance;
  }

  constructor(config: UsageAlertServiceConfig) {
    if (!config.stripeClient) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stripe client is required and cannot be empty",
      });
    }
    this.stripeClient = config.stripeClient;
  }

  public async create({
    orgId,
    customerId,
    meterId,
    amount,
  }: {
    orgId: string;
    customerId: string;
    meterId: string | null | undefined;
    amount: number;
  }) {
    if (!meterId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Meter ID is required to create a usage alert",
      });
    }

    return this.stripeClient.billing.alerts.create({
      title: `Usage Alert ${orgId}`,
      alert_type: "usage_threshold",
      usage_threshold: {
        filters: [
          {
            type: "customer",
            customer: customerId,
          },
        ],
        gte: amount,
        meter: meterId,
        recurrence: "one_time",
      },
    });
  }

  public async recreate({
    orgId,
    customerId,
    meterId,
    existingAlertId,
    amount,
  }: {
    orgId: string;
    customerId: string;
    meterId: string | null | undefined;
    existingAlertId: string;
    amount: number;
  }) {
    if (!meterId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Meter ID is required to recreate a usage alert",
      });
    }
    if (!existingAlertId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Existing alert ID is required to recreate a usage alert",
      });
    }

    // Deactivate the existing alert
    await this.stripeClient.billing.alerts.archive(existingAlertId);

    // Create a new alert with the same meter ID and updated amount
    return this.create({ orgId, customerId, meterId, amount });
  }

  public async activate({ id }: { id: string }) {
    return this.stripeClient.billing.alerts.activate(id);
  }

  public async deactivate({ id }: { id: string }) {
    return this.stripeClient.billing.alerts.deactivate(id);
  }
}

// Export the service class for testing purposes
export { UsageAlertService };
