import { z } from "zod/v4";

export const TracingSearchType = z.enum(["id", "content"]);
// id: for searching smaller columns like IDs, types, and other metadata
// content: for searching input/output text of functions traced via OpenTelemetry
export type TracingSearchType = z.infer<typeof TracingSearchType>;
