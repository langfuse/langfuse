/* eslint-disable @typescript-eslint/no-use-before-define */
import { backOff } from "exponential-backoff";

import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
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

/** truncatePagerDutySummary cuts a summary to the Events API limit. */
export function truncatePagerDutySummary(summary: string): string {
  if (summary.length <= summaryMaxLength) return summary;
  return `${summary.slice(0, summaryMaxLength - 3)}...`;
}

/** post sends one event to an Events API URL, retrying ServiceUnavailableErrors. */
async function post(
  url: string,
  body: PagerDutyAlertEvent | PagerDutyChangeEvent,
): Promise<void> {
  await backOff(() => postOnce(url, body), {
    numOfAttempts: maxAttempts,
    retry: shouldRetry,
  });
}

/** shouldRetry retries ServiceUnavailableErrors and logs each retry. */
function shouldRetry(error: unknown): boolean {
  if (!(error instanceof ServiceUnavailableError)) return false;
  logger.warn(`Retrying PagerDuty event: ${error.message}`);
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
  throw toPagerDutyError(
    response.status,
    `PagerDuty returned ${response.status}: ${responseBody}`.trim(),
  );
}

/** fetchEvent posts the JSON body, turning network errors into ServiceUnavailableErrors. */
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
    const reason = error instanceof Error ? error.message : "Unknown error";
    throw new ServiceUnavailableError(`PagerDuty request failed: ${reason}`);
  }
}

/** toPagerDutyError maps a rejected status to a base error; 429 and 5xx are ServiceUnavailableErrors. */
function toPagerDutyError(status: number, message: string): BaseError {
  if (status === 429 || status >= 500) {
    return new ServiceUnavailableError(message);
  }
  switch (status) {
    case 401:
      return new UnauthorizedError(message);
    case 403:
      return new ForbiddenError(message);
    case 404:
      return new LangfuseNotFoundError(message);
    default:
      return new InvalidRequestError(message);
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
