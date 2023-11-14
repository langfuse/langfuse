import { type Prisma, type PrismaClient } from "@prisma/client";
import { type NextApiRequest } from "next";

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
) => {
  const langfuseHeadersObject = Object.fromEntries(
    Object.entries(req.headers).filter(([key]) => key.startsWith("x-langfuse")),
  );

  await prisma.events.create({
    data: {
      project: { connect: { id: projectId } },
      url: req.url,
      method: req.method,
      data: data,
      headers: langfuseHeadersObject,
    },
  });
};
