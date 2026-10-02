import cronParser from "cron-parser";

import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { IN_APP_AGENT_ROUTINE_MIN_INTERVAL_MS } from "../routines";

export { buildInAppAgentRoutineCron } from "../routines";

export function isValidIanaTimeZone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function parseInAppAgentRoutineSchedule(params: {
  cron: string;
  timezone: string;
}): { cron: string; timezone: string } {
  const cron = params.cron.trim();
  const timezone = params.timezone.trim();

  if (cron.split(/\s+/).length !== 5) {
    throw new InvalidRequestError(
      "Schedule must be a 5-field cron expression (minute hour day month weekday)",
    );
  }

  if (!isValidIanaTimeZone(timezone)) {
    throw new InvalidRequestError("Unknown timezone");
  }

  let first: Date;
  let second: Date;

  try {
    const expression = cronParser.parseExpression(cron, {
      currentDate: new Date(),
      tz: timezone,
    });
    first = expression.next().toDate();
    second = expression.next().toDate();
  } catch {
    throw new InvalidRequestError("Invalid cron expression");
  }

  if (
    second.getTime() - first.getTime() <
    IN_APP_AGENT_ROUTINE_MIN_INTERVAL_MS
  ) {
    throw new InvalidRequestError(
      "Scheduled runs must be at least an hour apart",
    );
  }

  return { cron, timezone };
}

export function getNextInAppAgentRoutineRunAt(params: {
  cron: string;
  timezone: string;
  after: Date;
}): Date {
  const expression = cronParser.parseExpression(params.cron, {
    currentDate: params.after,
    tz: params.timezone,
  });

  return expression.next().toDate();
}

export function getPreviousInAppAgentRoutineRunAt(params: {
  cron: string;
  timezone: string;
  before: Date;
}): Date {
  const expression = cronParser.parseExpression(params.cron, {
    currentDate: params.before,
    tz: params.timezone,
  });

  return expression.prev().toDate();
}
