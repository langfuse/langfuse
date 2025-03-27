import z from "zod";
import { jsonSchema, jsonSchemaNullable } from "./utils/zod";

const MetadataDomain = z.record(
  z.string(),
  jsonSchemaNullable.or(z.undefined()),
);

// to be used across the application in frontend and backend.
export const TraceDomain = z.object({
  id: z.string(),
  name: z.string().nullish(),
  timestamp: z.date(),
  environment: z.string(),
  tags: z.array(z.string()),
  bookmarked: z.boolean(),
  public: z.boolean(),
  release: z.string().nullish(),
  version: z.string().nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  metadata: MetadataDomain,
  createdAt: z.date(),
  updatedAt: z.date(),
  sessionId: z.string().nullish(),
  userId: z.string().nullish(),
  projectId: z.string(),
});

export type Trace = z.infer<typeof TraceDomain>;
