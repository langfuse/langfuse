import type {
  EventRecordInsertType,
  InternalEventsWriter,
  InternalTraceEventInput,
  InternalTraceExperimentContext,
} from "@langfuse/shared/src/server";
import { clickhouseClient, redis } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../../services/ClickhouseWriter";
import { IngestionService } from "../../services/IngestionService";
import { env } from "../../env";

let internalTraceIngestionService: IngestionService | undefined;

function getInternalTraceIngestionService(): IngestionService {
  if (!internalTraceIngestionService) {
    internalTraceIngestionService = new IngestionService(
      redis as any,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );
  }

  return internalTraceIngestionService;
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

  if (env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true") {
    for (const eventRecord of eventRecords) {
      service.writeEventRecord(eventRecord);
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
