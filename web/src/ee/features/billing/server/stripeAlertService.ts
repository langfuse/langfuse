import { stripe } from "../utils/stripe";
import { STRIPE_METERS } from "../utils/stripeProducts";
import type Stripe from "stripe";

export interface CreateStripeAlertParams {
  customerId: string;
  threshold: number;
  meterId: string;
  currency?: string;
}

export interface UpdateStripeAlertParams {
  alertId: string;
  threshold: number;
}

/**
 * Creates a new Stripe billing alert for usage monitoring
 */
export async function createStripeAlert({
  customerId,
  threshold,
  meterId,
  currency = "USD",
}: CreateStripeAlertParams): Promise<Stripe.Billing.Alert> {
  const alert = await stripe.billing.alerts.create({
    alert_type: "usage_threshold",
    usage_threshold_config: {
      gte: threshold,
      meter: meterId,
      recurrence: "one_time",
    },
    filter: {
      customer: customerId,
    },
    title: `Usage Alert - ${currency} ${threshold}`,
  });

  return alert;
}

/**
 * Updates an existing Stripe billing alert threshold
 */
export async function updateStripeAlert({
  alertId,
  threshold,
}: UpdateStripeAlertParams): Promise<Stripe.Billing.Alert> {
  const alert = await stripe.billing.alerts.update(alertId, {
    usage_threshold_config: {
      gte: threshold,
      meter: STRIPE_METERS.TRACING_EVENTS,
      recurrence: "one_time",
    },
  });

  return alert;
}

/**
 * Deletes a Stripe billing alert
 */
export async function deleteStripeAlert(alertId: string): Promise<void> {
  await stripe.billing.alerts.del(alertId);
}

/**
 * Retrieves all billing alerts for a customer
 */
export async function getStripeAlerts(
  customerId: string,
): Promise<Stripe.Billing.Alert[]> {
  const alerts = await stripe.billing.alerts.list({
    filter: {
      customer: customerId,
    },
  });

  return alerts.data;
}

/**
 * Retrieves a specific billing alert by ID
 */
export async function getStripeAlert(
  alertId: string,
): Promise<Stripe.Billing.Alert> {
  return await stripe.billing.alerts.retrieve(alertId);
}

/**
 * Activates a Stripe billing alert
 */
export async function activateStripeAlert(
  alertId: string,
): Promise<Stripe.Billing.Alert> {
  return await stripe.billing.alerts.activate(alertId);
}

/**
 * Deactivates a Stripe billing alert
 */
export async function deactivateStripeAlert(
  alertId: string,
): Promise<Stripe.Billing.Alert> {
  return await stripe.billing.alerts.deactivate(alertId);
}
