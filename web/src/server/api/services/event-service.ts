import { type Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import { type NextApiRequest } from "next";
import { type jsonSchema } from "@langfuse/shared";
import lodash from "lodash";
import { env } from "@/src/env.mjs";
import { randomUUID } from "crypto";

// This function persists raw events to the database which came via API
// It relates each event to a project
// It checks that the event is valid JSON to avoid DB errors
// It persists over which URL and Method the event came in
// It does not extract more data to avoid any early errors such as schema parsing errors
// this table eventually becomes very large. Old data can be archived then in blob storage
export const persistEventMiddleware = async (
  prisma: PrismaClient,
  projectId: string,
  req: NextApiRequest,
  data: Prisma.JsonObject,
  metadata?: Zod.infer<typeof jsonSchema> | null,
) => {
  // If event logging is disabled, do nothing
  if (env.ENABLE_EVENT_LOG === "false") return;

  const langfuseHeadersObject = Object.fromEntries(
    Object.entries(req.headers).filter(([key]) => key.startsWith("x-langfuse")),
  );

  // combine metadata from the request and langfuseHeadersObject
  const combinedMetadata = lodash.merge(metadata, langfuseHeadersObject);

  await prisma.$queryRaw`
    INSERT INTO events (id, project_id, url, method, data, headers)
    VALUES (
      ${randomUUID()},
      ${projectId},
      ${req.url},
      ${req.method},
      ${data},
      ${combinedMetadata}
    );
  `;
};
