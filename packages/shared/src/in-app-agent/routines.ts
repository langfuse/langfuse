import { z } from "zod";

export const IN_APP_AGENT_ROUTINE_MAX_PER_USER = 20;
export const IN_APP_AGENT_ROUTINE_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH = 80;
export const IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH = 8_000;

export const CreateAndTestRoutineToolInputSchema = z.object({
  name: z.string().trim().min(1).max(IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH),
  prompt: z.string().trim().min(1).max(IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH),
  cron: z.string().trim().min(1).max(128),
  timezone: z.string().trim().min(1).max(64),
});

export type CreateAndTestRoutineToolInput = z.infer<
  typeof CreateAndTestRoutineToolInputSchema
>;

export const InAppAgentRoutineSkipReason = {
  MEMBERSHIP_LOST: "membership_lost",
  MODEL_UNCONFIGURED: "model_unconfigured",
  CAPACITY: "capacity",
} as const;

export type InAppAgentRoutineSkipReason =
  (typeof InAppAgentRoutineSkipReason)[keyof typeof InAppAgentRoutineSkipReason];

export const InAppAgentRoutinePreset = {
  DAILY: "daily",
  EVERY_X_HOURS: "every_x_hours",
  DAILY_HOURS: "daily_hours",
  WEEKDAYS: "weekdays",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export type InAppAgentRoutinePreset =
  (typeof InAppAgentRoutinePreset)[keyof typeof InAppAgentRoutinePreset];

export function buildInAppAgentRoutineCron(params: {
  minute: number;
  hour?: number;
  hours?: number[];
  everyHours?: number;
  weekdays?: boolean;
  weekday?: number;
  dayOfMonth?: number;
}): string {
  const minute = params.minute;

  if (params.everyHours !== undefined) {
    return `${minute} */${params.everyHours} * * *`;
  }

  if (params.hours && params.hours.length > 0) {
    return `${minute} ${params.hours.join(",")} * * *`;
  }

  const hour = params.hour ?? 9;

  if (params.weekdays) {
    return `${minute} ${hour} * * 1-5`;
  }

  if (params.weekday !== undefined) {
    return `${minute} ${hour} * * ${params.weekday}`;
  }

  if (params.dayOfMonth !== undefined) {
    return `${minute} ${hour} ${params.dayOfMonth} * *`;
  }

  return `${minute} ${hour} * * *`;
}
