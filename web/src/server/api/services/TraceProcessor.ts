import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { AuthenticationError } from "@/src/pages/api/public/ingestion";
import { type traceEvent } from "@/src/features/public-api/server/ingestion-api-schema";
import { prisma } from "shared/src/db/index";
import { mergeJson } from "@/src/utils/json";
import { type Trace, type Observation, type Score } from "@prisma/client";
import { v4 } from "uuid";
import { type z } from "zod";
import { jsonSchema } from "@/src/utils/zod";
import { QueueName, QueueJobs } from "shared/src/queues/queues";
import { type EventProcessor } from "./EventProcessor";
import { evalQueue } from "@/src/server/redis";

export class TraceProcessor implements EventProcessor {
  event: z.infer<typeof traceEvent>;

  constructor(event: z.infer<typeof traceEvent>) {
    this.event = event;
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError(
        `Access denied for trace creation, ${apiScope.accessLevel}`,
      );

    const internalId = body.id ?? v4();

    console.log(
      "Trying to create trace, project ",
      apiScope.projectId,
      ", body:",
      body,
    );

    const existingTrace = await prisma.trace.findFirst({
      where: {
        id: internalId,
      },
    });

    if (existingTrace && existingTrace.projectId !== apiScope.projectId) {
      throw new AuthenticationError(
        `Access denied for trace creation ${existingTrace.projectId} `,
      );
    }

    const mergedMetadata = mergeJson(
      existingTrace?.metadata
        ? jsonSchema.parse(existingTrace.metadata)
        : undefined,
      body.metadata ?? undefined,
    );

    if (body.sessionId) {
      await prisma.traceSession.upsert({
        where: {
          id_projectId: {
            id: body.sessionId,
            projectId: apiScope.projectId,
          },
        },
        create: {
          id: body.sessionId,
          projectId: apiScope.projectId,
        },
        update: {},
      });
    }

    // Do not use nested upserts or multiple where conditions as this should be a single native database upsert
    // https://www.prisma.io/docs/orm/reference/prisma-client-reference#database-upserts
    const upsertedTrace = await prisma.trace.upsert({
      where: {
        id: internalId,
      },
      create: {
        id: internalId,
        timestamp: this.event.body.timestamp
          ? new Date(this.event.body.timestamp)
          : undefined,
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        projectId: apiScope.projectId,
        tags: body.tags ?? undefined,
      },
      update: {
        name: body.name ?? undefined,
        timestamp: this.event.body.timestamp
          ? new Date(this.event.body.timestamp)
          : undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        tags: body.tags ?? undefined,
      },
    });

    await evalQueue?.add(QueueName.Evaluation, {
      name: QueueJobs.Evaluation,
      payload: {
        id: upsertedTrace.id,
        timestamp: new Date().toISOString(),
        data: {
          projectId: upsertedTrace.projectId,
          traceId: upsertedTrace.id,
        },
      },
    });

    return upsertedTrace;
  }
}
