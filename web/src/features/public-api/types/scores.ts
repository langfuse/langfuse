import z from "zod";
import { InvalidRequestError } from "@langfuse/shared";

export const ScoresCursorV3 = z.object({
  lastTimestamp: z.coerce.date(),
  lastEventTs: z.coerce.date(),
  lastId: z.string(),
});
export type ScoresCursorV3Type = z.infer<typeof ScoresCursorV3>;

export const EncodedScoresCursorV3 = z
  .string()
  .transform((val) => {
    try {
      const decoded = Buffer.from(val, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return parsed;
    } catch (_e) {
      throw new InvalidRequestError("Invalid cursor format");
    }
  })
  .pipe(ScoresCursorV3);

export const encodeCursorV3 = (cursor: ScoresCursorV3Type): string =>
  Buffer.from(
    JSON.stringify({
      lastTimestamp:
        cursor.lastTimestamp instanceof Date
          ? cursor.lastTimestamp.toISOString()
          : cursor.lastTimestamp,
      lastEventTs:
        cursor.lastEventTs instanceof Date
          ? cursor.lastEventTs.toISOString()
          : cursor.lastEventTs,
      lastId: cursor.lastId,
    }),
  ).toString("base64");
