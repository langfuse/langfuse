import { z } from "zod";
import { normalizedMessageSchema } from "../../utils/normalized-io/schema";
import { ObservationTypeDomain } from "../../domain/observations";

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

/** An observation with a WARNING or ERROR level and the status message it recorded. */
export const transcriptLevelEventSchema = z.object({
  observationId: z.string(),
  traceId: z.string().nullable(),
  type: ObservationTypeDomain,
  name: z.string().nullable(),
  level: z.enum(["ERROR", "WARNING"]),
  statusMessage: z.string().nullable(),
  startTime: z.date(),
});

export const transcriptSchema = z.object({
  threads: z.array(threadSchema),
  /** ERROR observations, and WARNING observations with a status message, in order.
   * Omitted when there are none. Independent of threads: a failed call can emit no messages.
   * Not counted against `maxCharacters`, which limits only the conversation. */
  levelEvents: z.array(transcriptLevelEventSchema).optional(),
  /** The character limit shortened text or omitted messages. */
  truncated: z.literal(true).optional(),
});
