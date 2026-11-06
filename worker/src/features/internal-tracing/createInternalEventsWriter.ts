import type {
  ClickhouseClientType,
  EventRecordInsertType,
  InternalEventsWriter,
  InternalTraceEventInput,
  InternalTraceExperimentContext,
} from "@langfuse/shared/src/server";
import { clickhouseClient, redis } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../../services/ClickhouseWriter";
import { IngestionService } from "../../services/IngestionService";
import { env, v4WritesToEventsTable } from "../../env";

let internalTraceIngestionService:
  | { service: IngestionService; client: ClickhouseClientType }
  | undefined;

// clickhouseClient() returns a new client when the ClickHouse credentials
// change, so the cached service is rebuilt around the current client.
function getInternalTraceIngestionService(): IngestionService {
  const client = clickhouseClient();
  if (internalTraceIngestionService?.client !== client) {
    internalTraceIngestionService = {
      service: new IngestionService(
        redis as any,
        prisma,
        ClickhouseWriter.getInstance(),
        client,
      ),
      client,
    };
  }

  return internalTraceIngestionService.service;
}

async function writeInternalEventInputs(params: {
  rootSpanId: string;
  eventInputs: InternalTraceEventInput[];
}): Promise<{ rootEventRecord?: EventRecordInsertType }> {
  const service = getInternalTraceIngestionService();

  const eventRecords = await Promise.all(
    params.eventInputs.map((eventInput) =>
      service.createEventRecord(eventInput, ""),
    ),
  );

  if (v4WritesToEventsTable(env)) {
    for (const eventRecord of eventRecords) {
      await service.writeEventRecord(eventRecord);
    }
  }

  return {
    rootEventRecord: eventRecords.find(
      (record) => record.span_id === params.rootSpanId,
    ),
  };
}

/**
 * Always materialize internal trace event records, even when direct events-table
 * writes are disabled. Self-hosted setups may not have `events_full`
 * configured, but experiment eval scheduling still depends on the normalized
 * root event record. The env flag therefore gates only the actual enqueue into
 * ClickHouse, not creation of the writer or invocation of the ready callback.
 */
export function createInternalEventsWriter(params?: {
  experimentContext?: InternalTraceExperimentContext;
  onRootEventRecordReady?: (
    rootEventRecord: EventRecordInsertType,
  ) => Promise<void>;
}): InternalEventsWriter {
  return {
    experimentContext: params?.experimentContext,
    write: async (writeParams: {
      rootSpanId: string;
      eventInputs: InternalTraceEventInput[];
    }) => {
      const { rootSpanId, eventInputs } = writeParams;
      const { rootEventRecord } = await writeInternalEventInputs({
        rootSpanId,
        eventInputs,
      });

      if (rootEventRecord && params?.onRootEventRecordReady) {
        await params.onRootEventRecordReady(rootEventRecord);
      }
    },
  };
}
