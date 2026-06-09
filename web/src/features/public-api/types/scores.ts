import { z } from "zod";
import { InvalidRequestError } from "@langfuse/shared";

export const ScoresCursorV3 = z.discriminatedUnion("v", [
  z.object({
    v: z.literal(1),
    lastTimestamp: z.coerce.date(),
    lastId: z.string(),
  }),
]);
export type ScoresCursorV3Type = z.infer<typeof ScoresCursorV3>;

export const EncodedScoresCursorV3 = z
  .string()
  .transform((val) => {
    try {
      const decoded = Buffer.from(val, "base64url").toString("utf-8");
      return JSON.parse(decoded);
    } catch (_e) {
      throw new InvalidRequestError("Invalid cursor format");
    }
  })
  .pipe(ScoresCursorV3);

export const encodeCursorV3 = (cursor: ScoresCursorV3Type): string =>
  Buffer.from(
    JSON.stringify({
      v: cursor.v,
      lastTimestamp: cursor.lastTimestamp.toISOString(),
      lastId: cursor.lastId,
    }),
  ).toString("base64url");
