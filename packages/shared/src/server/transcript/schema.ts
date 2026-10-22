import { z } from "zod";
import { normalizedMessageSchema } from "../../utils/normalized-io/schema";
import {
  ObservationLevelDomain,
  ObservationTypeDomain,
} from "../../domain/observations";

export const threadMessageSchema = normalizedMessageSchema.extend({
  /** Observation that first emitted this message. */
  observationId: z.string(),
  /** Trace of the emitting observation, including transcripts spanning several traces. */
  traceId: z.string(),
  /** Source observation start time, not the individual message time. */
  startTime: z.date(),
  /** Source observation end time; null while unavailable. */
  endTime: z.date().nullable(),
});

/** Messages of one turn with the observations that emitted them. */
export const turnSchema = z.object({
  /** Tree depth of the first contributing generation; fetched roots are level 0. */
  nestingLevel: z.number().int().nonnegative(),
  messages: z.array(threadMessageSchema),
  /** Observations that contributed to this turn, in contribution order. */
  observations: z.array(z.object({ id: z.string(), traceId: z.string() })),
});

export const threadSchema = z.object({
  /** Messages replayed from earlier turns, in replay order, without provenance. */
  conversationHistory: z.array(normalizedMessageSchema),
  /** Messages the supplied observations added to the conversation. */
  currentTurn: turnSchema,
});

export const transcriptSchema = z.object({
  threads: z.array(threadSchema),
  /** The character limit shortened text or omitted messages. */
  truncated: z.literal(true).optional(),
});

/** An ERROR observation, or a WARNING observation with a status message. */
export const executionIssueSchema = z.object({
  observationId: z.string(),
  traceId: z.string().nullable(),
  type: ObservationTypeDomain,
  name: z.string().nullable(),
  level: ObservationLevelDomain.extract(["ERROR", "WARNING"]),
  /** First 1,000 characters of the status message. */
  statusMessage: z.string().nullable(),
  startTime: z.date(),
});
