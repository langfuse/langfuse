import { type PrismaClient } from "@prisma/client";

export const validTraceObject = async (
  prisma: PrismaClient,
  projectId: string,
  traceIdType?: "EXTERNAL" | "LANGFUSE",
  traceId?: string
) => {
  if (traceId) {
    const trace =
      traceIdType === "EXTERNAL"
        ? await prisma.trace.findUnique({
            where: {
              projectId_externalId: {
                projectId: projectId,
                externalId: traceId,
              },
            },
          })
        : await prisma.trace.findUnique({
            where: {
              id: traceId,
            },
          });

    if (trace && trace.release) {
      console.error(
        `Release cannot be provided if trace exists already. Trace: ${trace.id}`
      );
      return false;
    }
    return true;
  }
  return true;
};
