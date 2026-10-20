import { z } from "zod";
import type { JsonValue } from "../../utils/normalized-io/types";
import {
  threadMessageSchema,
  threadSchema,
  transcriptSchema,
  turnSchema,
} from "./schema";
import type { Transcript } from "./types";

const timestamp = z.iso.datetime({ offset: true });
const storedMessageV1Schema = threadMessageSchema.extend({
  startTime: timestamp,
  endTime: timestamp.nullable(),
});

/** V1 shares the current content shape. Freeze its full schema graph before a breaking change. */
export const storedTranscriptV1Schema = transcriptSchema.extend({
  threads: z.array(
    threadSchema.extend({
      currentTurn: turnSchema.extend({
        messages: z.array(storedMessageV1Schema),
      }),
    }),
  ),
}) satisfies z.ZodType<JsonValue>;

export function toStoredTranscriptV1(value: Transcript): StoredTranscriptV1 {
  return {
    ...value,
    threads: value.threads.map((thread) => ({
      ...thread,
      currentTurn: {
        ...thread.currentTurn,
        messages: thread.currentTurn.messages.map((message) => ({
          ...message,
          startTime: message.startTime.toISOString(),
          endTime: message.endTime?.toISOString() ?? null,
        })),
      },
    })),
  };
}

/** Decode an already validated V1 payload into the current transcript representation. */
export function fromStoredTranscriptV1(value: StoredTranscriptV1): Transcript {
  return {
    ...value,
    threads: value.threads.map((thread) => ({
      ...thread,
      currentTurn: {
        ...thread.currentTurn,
        messages: thread.currentTurn.messages.map((message) => ({
          ...message,
          startTime: new Date(message.startTime),
          endTime: message.endTime === null ? null : new Date(message.endTime),
        })),
      },
    })),
  };
}

export type StoredTranscriptV1 = z.infer<typeof storedTranscriptV1Schema>;
