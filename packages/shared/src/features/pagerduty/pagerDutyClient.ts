/* eslint-disable @typescript-eslint/no-use-before-define */
import { backOff } from "exponential-backoff";

import {
  GatewayTimeoutError,
  isBaseError,
  ServiceUnavailableError,
  TooManyRequestsError,
  toBaseError,
} from "../../errors";
import { logger } from "../../server/logger";
import { type PagerDutyRegion } from "./types";

/** PAGERDUTY_EVENTS_HOSTS is the fixed allowlist of Events API hosts per service region. */
export const PAGERDUTY_EVENTS_HOSTS: Record<PagerDutyRegion, string> = {
  US: "events.pagerduty.com",
  EU: "events.eu.pagerduty.com",
};

const summaryMaxLength = 1024;
const requestTimeoutMs = 10_000;
const maxAttempts = 4;

/** pagerDutyClient sends events to the Events API of a routing key's region, retrying 429, 5xx and network errors. */
export const pagerDutyClient = {
  /** alert enqueues an alert event at the region's `/v2/enqueue`. */
  alert(args: {
    region: PagerDutyRegion;
    event: PagerDutyAlertEvent;
  }): Promise<void> {
    return post(
      `https://${PAGERDUTY_EVENTS_HOSTS[args.region]}/v2/enqueue`,
      args.event,
    );
  },

  /** change posts a change event, which never pages anyone, to the region's `/v2/change/enqueue`. */
  change(args: {
    region: PagerDutyRegion;
    event: PagerDutyChangeEvent;
  }): Promise<void> {
    return post(
      `https://${PAGERDUTY_EVENTS_HOSTS[args.region]}/v2/change/enqueue`,
      args.event,
    );
  },
};

/** isRetryablePagerDutyError reports whether a failed Events API call may succeed on retry: 429, 5xx, timeouts and network errors. */
export function isRetryablePagerDutyError(error: unknown): boolean {
  if (error instanceof TooManyRequestsError) return true;
  return isBaseError(error) && error.httpCode >= 500;
}

/** truncatePagerDutySummary cuts a summary to the Events API limit. */
export function truncatePagerDutySummary(summary: string): string {
  if (summary.length <= summaryMaxLength) return summary;
  return `${summary.slice(0, summaryMaxLength - 3)}...`;
}

/** post sends one event to an Events API URL, retrying retryable failures. */
async function post(
  url: string,
  body: PagerDutyAlertEvent | PagerDutyChangeEvent,
): Promise<void> {
  await backOff(() => postOnce(url, body), {
    numOfAttempts: maxAttempts,
    retry: shouldRetry,
  });
}

/** shouldRetry retries retryable failures and logs each retry. */
function shouldRetry(error: unknown): boolean {
  if (!isRetryablePagerDutyError(error)) return false;
  logger.warn(`Retrying PagerDuty event: ${String(error)}`);
  return true;
}

/** postOnce sends one event once and throws the base error matching a rejection. */
async function postOnce(
  url: string,
  body: PagerDutyAlertEvent | PagerDutyChangeEvent,
): Promise<void> {
  const response = await fetchEvent(url, body);
  if (response.ok) return;

  const responseBody = (await response.text().catch(() => "")).slice(0, 1000);
  throw toBaseError(
    response.status,
    `PagerDuty returned ${response.status}: ${responseBody}`.trim(),
  );
}

/** fetchEvent posts the JSON body, turning timeouts into GatewayTimeoutErrors and other network errors into ServiceUnavailableErrors. */
async function fetchEvent(
  url: string,
  body: PagerDutyAlertEvent | PagerDutyChangeEvent,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new GatewayTimeoutError(
        `PagerDuty did not respond within ${requestTimeoutMs}ms`,
      );
    }
    const reason = error instanceof Error ? error.message : "Unknown error";
    throw new ServiceUnavailableError(`PagerDuty request failed: ${reason}`);
  }
}

/** PagerDutyLink is a clickable link rendered on the PagerDuty alert. */
export type PagerDutyLink = { href: string; text?: string };

/** PagerDutyAlertEvent is an Events API v2 alert event. */
export type PagerDutyAlertEvent = {
  routing_key: string;
  event_action: "trigger" | "acknowledge" | "resolve";
  dedup_key: string;
  client?: string;
  client_url?: string;
  links?: PagerDutyLink[];
  payload?: {
    summary: string;
    source: string;
    severity: PagerDutySeverity;
    timestamp?: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, unknown>;
  };
};

/** PagerDutySeverity is the alert severity PagerDuty routes on. */
export type PagerDutySeverity = "critical" | "error" | "warning" | "info";

/** PagerDutyChangeEvent is a Change Events API event. */
export type PagerDutyChangeEvent = {
  routing_key: string;
  links?: PagerDutyLink[];
  payload: {
    summary: string;
    source?: string;
    timestamp?: string;
    custom_details?: Record<string, unknown>;
  };
};
