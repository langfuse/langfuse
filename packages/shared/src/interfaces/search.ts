import { z } from "zod";

export const TracingSearchType = z.enum(["id", "text"]);
export type TracingSearchType = z.infer<typeof TracingSearchType>;
