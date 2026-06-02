import z from "zod";
import { InvalidRequestError } from "@langfuse/shared";

export const ScoresCursorV3 = z.object({
  lastTimestamp: z.coerce.date(),
  lastEventTs: z.coerce.date(),
  lastId: z.string(),
});
export type ScoresCursorV3Type = z.infer<typeof ScoresCursorV3>;

export const EncodedScoresCursorV3 = z.string().transform((val) => {
  let parsed: unknown;
  try {
    const decoded = Buffer.from(val, "base64url").toString("utf-8");
    parsed = JSON.parse(decoded);
  } catch (_e) {
    throw new InvalidRequestError("Invalid cursor format");
  }
  const result = ScoresCursorV3.safeParse(parsed);
  if (!result.success) {
    throw new InvalidRequestError("Invalid cursor format");
  }
  return result.data;
});

export const encodeCursorV3 = (cursor: ScoresCursorV3Type): string =>
  Buffer.from(
    JSON.stringify({
      lastTimestamp: cursor.lastTimestamp.toISOString(),
      lastEventTs: cursor.lastEventTs.toISOString(),
      lastId: cursor.lastId,
    }),
  ).toString("base64url");
