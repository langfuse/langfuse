import { randomUUID } from "crypto";

import {
  ForbiddenError,
  ObservationLevel,
  ObservationTypeDomain,
} from "../../";
import {
  type TraceEventType,
  type IngestionEventType,
  redis,
  logger,
  instrumentAsync,
  recordIncrement,
  traceException,
  getS3EventStorageClient,
  QueueJobs,
  instrumentSync,
  recordDistribution,
  UsageDetails,
  extractToolsFromObservation,
  convertDefinitionsToMap,
  convertCallsToArrays,
} from "../";

import { LangfuseOtelSpanAttributes } from "./attributes";
import { ObservationTypeMapperRegistry } from "./ObservationTypeMapper";
import { env } from "../../env";
import { OtelIngestionQueue } from "../redis/otelIngestionQueue";
import { isValidDateString, flattenJsonToPathArrays } from "./utils";

// Type definitions for internal processor state
interface TraceState {
  hasFullTrace: boolean;
  shallowEventIds: string[];
}

export interface OtelIngestionProcessorConfig {
  projectId: string;
  publicKey?: string;
  orgId?: string;
  propagatedHeaders?: Record<string, string>;
  sdkName?: string;
  sdkVersion?: string;
  ingestionVersion?: string;
}

interface CreateTraceEventParams {
  traceId: string;
  startTimeISO: string;
  attributes: Record<string, unknown>;
  resourceAttributes: Record<string, unknown>;
  resourceAttributeMetadata: Record<string, unknown>;
  scopeSpan: any;
  scopeAttributes: Record<string, unknown>;
  isLangfuseSDKSpans: boolean;
  isRootSpan: boolean;
  hasTraceUpdates: boolean;
  parentObservationId: string | null;
  span: any;
}

interface CreateObservationEventParams {
  span: any;
  traceId: string;
  parentObservationId: string | null;
  attributes: Record<string, unknown>;
  resourceAttributes: Record<string, unknown>;
  resourceAttributeMetadata: Record<string, unknown>;
  spanAttributeMetadata: Record<string, unknown>;
  scopeSpan: any;
  scopeAttributes: Record<string, unknown>;
  isLangfuseSDKSpans: boolean;
  startTimeISO: string;
  endTimeISO: string;
}

type NanoTimestamp =
  | number
  | string
  | {
      high: number;
      low: number;
    }
  | null
  | undefined;

type TimestampField = "start_time" | "end_time" | "unknown";

export interface ResourceSpan {
  resource?: {
    attributes?: Array<{ key: string; value: any }>;
  };
  scopeSpans?: Array<{
    scope?: {
      name: string;
      version?: string;
      attributes?: Array<{ key: string; value: any }>;
    };
    spans?: Array<{
      traceId: { data?: Buffer } | Buffer;
      spanId: { data?: Buffer } | Buffer;
      parentSpanId?: { data?: Buffer } | Buffer;
      name: string;
      kind: number;
      startTimeUnixNano?: NanoTimestamp;
      endTimeUnixNano?: NanoTimestamp;
      attributes?: Array<{ key: string; value: any }>;
      events?: any[];
      status?: { code?: number; message?: string };
    }>;
  }>;
}

const observationTypeMapper = new ObservationTypeMapperRegistry();

/**
 * Processor class that encapsulates all logic for converting OpenTelemetry
 * resource spans into Langfuse ingestion events.
 *
 * Manages trace deduplication internally and provides a clean interface
 * for converting OTEL spans to Langfuse events.
 */
const LIVEKIT_DEBUG_SPAN_NAMES = new Set([
  "user_speaking",
  "eou_detection",
  "llm_request_run",
  "tts_node",
  "tts_request",
  "tts_request_run",
  "tts_stream_adapter",
  "agent_speaking",
  "drain_agent_activity",
  "on_exit",
  "on_enter",
  "llm_fallback_adapter",
  "tts_fallback_adapter",
  "start_agent_activity",
  "on_enter",
]);

export class OtelIngestionProcessor {
  private static readonly OTEL_CONVERSION_FAILURE_METRIC =
    "langfuse.ingestion.otel.conversion_failure";

  private seenTraces: Set<string> = new Set();
  private isInitialized = false;
  private traceEventCounts = {
    shallow: 0,
    rootSpanClosed: 0,
    traceUpdated: 0,
  };
  private readonly projectId: string;
  private readonly publicKey?: string;
  private readonly orgId?: string;
  private readonly propagatedHeaders?: Record<string, string>;
  private readonly sdkName?: string;
  private readonly sdkVersion?: string;
  private readonly ingestionVersion?: string;

  constructor(config: OtelIngestionProcessorConfig) {
    this.projectId = config.projectId;
    this.publicKey = config.publicKey;
    this.orgId = config.orgId;
    this.propagatedHeaders = config.propagatedHeaders;
    this.sdkName = config.sdkName;
    this.sdkVersion = config.sdkVersion;
    this.ingestionVersion = config.ingestionVersion;
  }

  /**
   * Returns the current time as yyyy/mm/dd/hh/mm`.
   */
  private getCurrentTimePath(): string {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${String(now.getHours()).padStart(2, "0")}/${String(now.getMinutes()).padStart(2, "0")}`;
  }

  /**
   * Uploads a batch of resourceSpans to blob storage and adds a job to process them
   * into the otel-ingestion-queue.
   */
  async publishToOtelIngestionQueue(resourceSpans: ResourceSpan[]) {
    const fileKey = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}otel/${this.projectId}/${this.getCurrentTimePath()}/${randomUUID()}.json`;

    // Upload to S3
    await getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    ).uploadJson(fileKey, resourceSpans as Record<string, unknown>[]);

    // Add queue job
    const queue = OtelIngestionQueue.getInstance({});
    return queue
      ? queue.add(QueueJobs.OtelIngestionJob, {
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.OtelIngestionJob as const,
          payload: {
            data: {
              fileKey,
              publicKey: this.publicKey,
            },
            authCheck: {
              validKey: true,
              scope: {
                projectId: this.projectId,
                accessLevel: "project" as const,
                orgId: this.orgId,
              },
            },
            propagatedHeaders: this.propagatedHeaders,
            sdkName: this.sdkName,
            sdkVersion: this.sdkVersion,
            ingestionVersion: this.ingestionVersion,
          },
        })
      : Promise.reject("Failed to instantiate otel ingestion queue");
  }

  /**
   * Processes incoming resourceSpans and produces an event base record that can be enriched
   * using the IngestionService.
   * @param resourceSpans
   */
  processToEvent(resourceSpans: ResourceSpan[]): any[] {
    return instrumentSync({ name: "otel-event-processor" }, (span) => {
      try {
        span.setAttribute("project_id", this.projectId);
        span.setAttribute(
          "total_span_count",
          this.getTotalSpanCount(resourceSpans),
        );

        // Input validation
        if (!Array.isArray(resourceSpans)) {
          return [];
        }
        if (resourceSpans.length === 0) {
          return [];
        }

        return resourceSpans
          .filter((r) => Boolean(r))
          .flatMap((resourceSpan) => {
            const resourceAttributes =
              this.extractResourceAttributes(resourceSpan);
            const events: any[] = [];

            for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
              const scopeAttributes = this.extractScopeAttributes(scopeSpan);
              for (const span of scopeSpan?.spans ?? []) {
                const spanAttributes = this.extractSpanAttributes(span);
                const traceId = this.parseId(span.traceId);
                const spanId = this.parseId(span.spanId);
                const parentSpanId = span?.parentSpanId
                  ? this.parseId(span.parentSpanId)
                  : null;
                const name = span.name;
                const { startTimeISO, endTimeISO } =
                  OtelIngestionProcessor.resolveSpanTimestamps({
                    startTimeUnixNano: span.startTimeUnixNano,
                    endTimeUnixNano: span.endTimeUnixNano,
                  });

                // Extract metadata from different sources
                const spanMetadata = this.extractMetadata(
                  spanAttributes,
                  "observation",
                );
                const traceMetadata = this.extractMetadata(
                  spanAttributes,
                  "trace",
                );

                // Extract input/output (filteredAttributes not needed as metadata.attributes is commented out)
                // Add filteredAttributes in case spanAttributes are included in the metadata block.
                const { input, output } = this.extractInputAndOutput({
                  events: span?.events ?? [],
                  attributes: spanAttributes,
                  instrumentationScopeName: scopeSpan?.scope?.name ?? "",
                });

                // Construct metadata object with the specified structure
                const metadata = {
                  // attributes: filteredAttributes,
                  resourceAttributes: resourceAttributes,
                  scopeAttributes: scopeAttributes,
                  ...spanMetadata,
                  ...traceMetadata,
                };

                // Extract instrumentation metadata
                const serviceName = resourceAttributes?.["service.name"] as
                  | string
                  | undefined;
                const serviceVersion = resourceAttributes?.[
                  "service.version"
                ] as string | undefined;
                const telemetrySdkLanguage = resourceAttributes?.[
                  "telemetry.sdk.language"
                ] as string | undefined;
                const telemetrySdkName = resourceAttributes?.[
                  "telemetry.sdk.name"
                ] as string | undefined;
                const telemetrySdkVersion = resourceAttributes?.[
                  "telemetry.sdk.version"
                ] as string | undefined;
                const scopeName = scopeSpan?.scope?.name;
                const scopeVersion = scopeSpan?.scope?.version;

                const stringifiedSpan = JSON.stringify(span);
                const eventBytes = Buffer.byteLength(stringifiedSpan, "utf8");

                recordDistribution(
                  "langfuse.ingestion.otel.event.byte_length",
                  eventBytes,
                  {
                    source: "otel",
                    sdk_language: telemetrySdkLanguage || "",
                  },
                );

                const experimentFields =
                  this.extractExperimentFields(spanAttributes);

                const usageDetails = UsageDetails.safeParse(
                  this.extractUsageDetails(
                    spanAttributes,
                    scopeSpan?.scope?.name ?? "",
                  ),
                );
                if (!usageDetails.success) {
                  logger.warn(
                    `Invalid usage details extracted from OTEL span for traceId ${traceId}: ${JSON.stringify(usageDetails.error)}`,
                  );
                }

                let toolDefinitions = undefined;
                let toolCalls = undefined;
                let toolCallNames = undefined;

                const { toolDefinitions: rawToolDefinitions, toolArguments } =
                  extractToolsFromObservation(input, output);

                if (rawToolDefinitions.length > 0) {
                  toolDefinitions = convertDefinitionsToMap(rawToolDefinitions);
                }

                if (toolArguments.length > 0) {
                  const { tool_calls, tool_call_names } =
                    convertCallsToArrays(toolArguments);
                  toolCalls = tool_calls;
                  toolCallNames = tool_call_names;
                }

                events.push({
                  projectId: this.projectId,
                  traceId,
                  spanId,
                  parentSpanId,

                  name,
                  type: observationTypeMapper.mapToObservationType(
                    spanAttributes,
                    resourceAttributes,
                    scopeSpan?.scope,
                    span.name,
                  ),
                  environment: this.extractEnvironment(
                    spanAttributes,
                    resourceAttributes,
                  ),
                  version:
                    spanAttributes?.[LangfuseOtelSpanAttributes.VERSION] ??
                    resourceAttributes?.["service.version"] ??
                    null,

                  startTimeISO,
                  endTimeISO,

                  level:
                    spanAttributes[
                      LangfuseOtelSpanAttributes.OBSERVATION_LEVEL
                    ] ??
                    (span.status?.code === 2
                      ? ObservationLevel.ERROR
                      : scopeSpan?.scope?.name === "livekit-agents" &&
                          LIVEKIT_DEBUG_SPAN_NAMES.has(span.name)
                        ? ObservationLevel.DEBUG
                        : ObservationLevel.DEFAULT),
                  statusMessage:
                    spanAttributes[
                      LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE
                    ] ??
                    span.status?.message ??
                    null,

                  promptName:
                    spanAttributes?.[
                      LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME
                    ] ??
                    spanAttributes["langfuse.prompt.name"] ??
                    this.parseLangfusePromptFromAISDK(spanAttributes)?.name ??
                    null,
                  promptVersion:
                    spanAttributes?.[
                      LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION
                    ] ??
                    spanAttributes["langfuse.prompt.version"] ??
                    this.parseLangfusePromptFromAISDK(spanAttributes)
                      ?.version ??
                    null,

                  modelParameters: this.extractModelParameters(
                    spanAttributes,
                    scopeSpan?.scope?.name ?? "",
                  ),
                  modelName: this.extractModelName(spanAttributes),
                  completionStartTime: this.extractCompletionStartTime(
                    spanAttributes,
                    startTimeISO,
                  ),

                  // Usage and cost details
                  providedUsageDetails: usageDetails.success
                    ? usageDetails.data
                    : undefined,
                  providedCostDetails: this.extractCostDetails(spanAttributes),

                  // Properties
                  tags: this.extractTags(spanAttributes),
                  public: this.extractPublic(spanAttributes),
                  traceName:
                    spanAttributes?.[LangfuseOtelSpanAttributes.TRACE_NAME] ??
                    null,
                  userId: this.extractUserId(spanAttributes),
                  sessionId: this.extractSessionId(spanAttributes),
                  release:
                    (spanAttributes?.[
                      LangfuseOtelSpanAttributes.RELEASE
                    ] as string) ??
                    resourceAttributes?.[LangfuseOtelSpanAttributes.RELEASE] ??
                    null,

                  input,
                  output,

                  // Metadata
                  metadata,

                  // Instrumentation metadata
                  source: "otel",
                  serviceName,
                  serviceVersion,
                  scopeName,
                  scopeVersion,
                  telemetrySdkLanguage,
                  telemetrySdkName,
                  telemetrySdkVersion,

                  // Source data
                  // eventRaw: stringifiedSpan,
                  eventBytes,

                  // Experiment fields
                  ...experimentFields,

                  // Tool calling
                  toolDefinitions,
                  toolCalls,
                  toolCallNames,
                });
              }
            }

            return events;
          });
      } catch (error) {
        logger.error("Error processing OTEL spans to events:", error);
        traceException(error, span);
        throw error;
      }
    });
  }

  /**
   * Process resource spans and convert them to Langfuse ingestion events.
   * Handles trace deduplication automatically using internal state.
   * Initializes seen traces from Redis automatically on first call.
   * Filters out shallow trace events if full trace events exist for the same traceId.
   */
  async processToIngestionEvents(
    resourceSpans: ResourceSpan[],
  ): Promise<IngestionEventType[]> {
    return await instrumentAsync(
      { name: "otel-ingestion-processor" },
      async (span) => {
        span.setAttribute("project_id", this.projectId);
        span.setAttribute(
          "total_span_count",
          this.getTotalSpanCount(resourceSpans),
        );

        try {
          // Lazy initialization - load seen traces from Redis if not already done
          // Seen traces are traces that went through the ingestion pipeline within last 10 minutes
          if (!this.isInitialized) {
            this.seenTraces = await this.getSeenTracesSet(resourceSpans);
            this.isInitialized = true;
          }

          // Input validation
          if (!Array.isArray(resourceSpans)) {
            return [];
          }

          if (resourceSpans.length === 0) {
            return [];
          }

          // Process all events normally first
          const allEvents = resourceSpans.flatMap((resourceSpan) => {
            if (!resourceSpan) return [];
            return this.processResourceSpan(resourceSpan);
          });

          // Filter out redundant shallow trace events
          const finalEvents = this.filterRedundantShallowTraces(allEvents);

          span.setAttribute("events_generated", finalEvents.length);

          this.traceEventCounts.shallow = Math.max(
            this.traceEventCounts.shallow -
              (allEvents.length - finalEvents.length),
            0,
          );

          for (const key of Object.keys(
            this.traceEventCounts,
          ) as (keyof typeof this.traceEventCounts)[]) {
            recordIncrement(
              "langfuse.ingestion.otel.trace_create_event",
              this.traceEventCounts[key],
              { reason: key },
            );
          }

          return finalEvents;
        } catch (error) {
          if (error instanceof ForbiddenError) {
            traceException(error, span);
            throw error;
          }

          // Log error but don't throw to avoid breaking the ingestion pipeline
          logger.error("Error processing OTEL spans:", error);
          traceException(error, span);

          return [];
        }
      },
    );
  }

  /**
   * Filter out shallow trace-create events if a full trace-create event exists for the same traceId.
   * Maintains optimal trace representation per traceId in the final event list.
   *
   * Performance: O(n) where n is the number of events
   */
  private filterRedundantShallowTraces(
    events: IngestionEventType[],
  ): IngestionEventType[] {
    if (events.length === 0) return events;

    // Fast path: if no trace-create events, return as-is
    const hasTraceEvents = events.some(
      (event) => event.type === "trace-create",
    );
    if (!hasTraceEvents) return events;

    // Track trace states by traceId - using simpler structure for better performance
    const traceStates = new Map<string, TraceState>();

    // Single pass: categorize trace-create events by type
    for (const event of events) {
      if (event.type === "trace-create") {
        const traceId = event.body.id as string;

        if (!traceStates.has(traceId)) {
          // Initialize entry
          traceStates.set(traceId, {
            hasFullTrace: false,
            shallowEventIds: [],
          });
        }

        const traceState = traceStates.get(traceId)!;
        const isShallowTrace = this.isShallowTraceEvent(event.body);

        if (isShallowTrace) {
          traceState.shallowEventIds.push(event.id);
        } else {
          traceState.hasFullTrace = true;
        }
      }
    }

    // Collect event IDs to exclude (only if we have conflicts)
    const eventIdsToExclude = new Set<string>();
    for (const traceState of traceStates.values()) {
      if (traceState.hasFullTrace && traceState.shallowEventIds.length > 0) {
        traceState.shallowEventIds.forEach((id) => eventIdsToExclude.add(id));
      }
    }

    // Early return if no filtering needed
    if (eventIdsToExclude.size === 0) return events;

    // Filter out redundant shallow traces
    return events.filter((event) => !eventIdsToExclude.has(event.id));
  }

  /**
   * Determine if a trace event body represents a shallow trace.
   * Shallow traces only contain minimal fields: id, timestamp, environment.
   * Full traces have additional meaningful fields like: name, metadata, userId, etc.
   */
  private isShallowTraceEvent(traceBody: TraceEventType["body"]): boolean {
    // Define minimal fields that shallow traces have
    const SHALLOW_TRACE_FIELDS = new Set(["id", "timestamp", "environment"]);

    // Check for presence of any full trace indicators
    // These fields indicate a full trace with meaningful trace-level data
    const FULL_TRACE_INDICATORS = [
      "name",
      "metadata",
      "userId",
      "sessionId",
      "public",
      "tags",
      "version",
      "release",
      "input",
      "output",
    ] as const;

    // Fast path: check for any full trace indicators with meaningful values
    for (const field of FULL_TRACE_INDICATORS) {
      const value = traceBody[field];
      if (this.hasMeaningfulValue(value)) {
        return false; // Has full trace data
      }
    }

    // If no full trace indicators, verify it has the basic shallow fields
    return (
      SHALLOW_TRACE_FIELDS.has("id") &&
      this.hasMeaningfulValue(traceBody.id) &&
      this.hasMeaningfulValue(traceBody.timestamp) &&
      this.hasMeaningfulValue(traceBody.environment)
    );
  }

  /**
   * Check if a value is meaningful (not null, undefined, empty string, or empty object/array)
   */
  private hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined || value === "") {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object" && value !== null) {
      return Object.keys(value).length > 0;
    }
    return true;
  }

  private processResourceSpan(
    resourceSpan: ResourceSpan,
  ): IngestionEventType[] {
    const resourceAttributes = this.extractResourceAttributes(resourceSpan);
    const events: IngestionEventType[] = [];

    for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
      const isLangfuseSDKSpans =
        scopeSpan.scope?.name?.startsWith("langfuse-sdk") ?? false;
      const scopeAttributes = this.extractScopeAttributes(scopeSpan);

      if (isLangfuseSDKSpans) {
        recordIncrement("langfuse.otel.ingestion.langfuse_sdk_batch", 1);
      }

      for (const span of scopeSpan?.spans ?? []) {
        const spanEvents = this.processSpan(
          span,
          scopeSpan,
          resourceAttributes,
          scopeAttributes,
          isLangfuseSDKSpans,
        );
        events.push(...spanEvents);
      }
    }

    return events;
  }

  private processSpan(
    span: any,
    scopeSpan: any,
    resourceAttributes: Record<string, unknown>,
    scopeAttributes: Record<string, unknown>,
    isLangfuseSDKSpans: boolean,
  ): IngestionEventType[] {
    const events: IngestionEventType[] = [];
    const attributes = this.extractSpanAttributes(span);

    const traceId = this.parseId(span.traceId?.data ?? span.traceId);
    const parentObservationId = span?.parentSpanId
      ? this.parseId(span.parentSpanId?.data ?? span.parentSpanId)
      : null;

    const spanAttributeMetadata = this.extractMetadata(
      attributes,
      "observation",
    );
    const resourceAttributeMetadata = this.extractMetadata(
      resourceAttributes,
      "trace",
    );
    const { startTimeISO, endTimeISO } =
      OtelIngestionProcessor.resolveSpanTimestamps({
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.endTimeUnixNano,
      });

    const isRootSpan =
      !parentObservationId ||
      String(attributes[LangfuseOtelSpanAttributes.AS_ROOT]) === "true";

    const hasTraceUpdates = this.hasTraceUpdates(attributes);

    // Handle trace creation logic with internal seen traces management
    if (isRootSpan || hasTraceUpdates || !this.seenTraces.has(traceId)) {
      const traceEvent = this.createTraceEvent({
        traceId,
        startTimeISO,
        attributes,
        resourceAttributes,
        resourceAttributeMetadata,
        scopeSpan,
        scopeAttributes,
        isLangfuseSDKSpans,
        isRootSpan,
        hasTraceUpdates,
        parentObservationId,
        span,
      });
      events.push(traceEvent);

      // Update internal seen traces cache
      this.seenTraces.add(traceId);
    }

    // Create observation event
    const observationEvent = this.createObservationEvent({
      span,
      traceId,
      parentObservationId,
      attributes,
      resourceAttributes,
      resourceAttributeMetadata,
      spanAttributeMetadata,
      scopeSpan,
      scopeAttributes,
      isLangfuseSDKSpans,
      startTimeISO,
      endTimeISO,
    });
    events.push(observationEvent);

    return events;
  }

  private createTraceEvent(params: CreateTraceEventParams): IngestionEventType {
    const {
      traceId,
      startTimeISO,
      attributes,
      resourceAttributes,
      resourceAttributeMetadata,
      scopeSpan,
      scopeAttributes,
      isLangfuseSDKSpans,
      isRootSpan,
      hasTraceUpdates,
      span,
    } = params;

    // Create shallow trace for new traces without root span or trace updates
    let trace: TraceEventType["body"] = {
      id: traceId,
      timestamp: startTimeISO,
      environment: this.extractEnvironment(attributes, resourceAttributes),
    };

    const instrumentationScopeName = scopeSpan?.scope?.name as string;

    // Create full trace for root spans or spans with trace updates
    if (isRootSpan) {
      // Extract input/output and get filtered attributes
      const { input, output, filteredAttributes } = this.extractInputAndOutput({
        events: span?.events ?? [],
        attributes,
        domain: "trace",
        instrumentationScopeName,
      });

      trace = {
        ...trace,
        name:
          (attributes[LangfuseOtelSpanAttributes.TRACE_NAME] as string) ??
          this.extractName(span.name, attributes),
        metadata: {
          ...resourceAttributeMetadata,
          ...this.extractMetadata(attributes, "trace"),
          ...this.extractMetadata(attributes, "observation"),
          ...(isLangfuseSDKSpans ? {} : { attributes: filteredAttributes }),
          resourceAttributes,
          scope: {
            ...(scopeSpan.scope || {}),
            attributes: scopeAttributes,
          },
        } as Record<string, string | Record<string, string | number>>,
        version:
          (attributes?.[LangfuseOtelSpanAttributes.VERSION] as string) ??
          resourceAttributes?.["service.version"] ??
          null,
        release:
          (attributes?.[LangfuseOtelSpanAttributes.RELEASE] as string) ??
          resourceAttributes?.[LangfuseOtelSpanAttributes.RELEASE] ??
          null,
        userId: this.extractUserId(attributes),
        sessionId: this.extractSessionId(attributes),
        public: this.extractPublic(attributes),
        tags: this.extractTags(attributes),
        environment: this.extractEnvironment(attributes, resourceAttributes),
        input,
        output,
      };
    }

    if (hasTraceUpdates && !isRootSpan) {
      trace = {
        ...trace,
        name: attributes[LangfuseOtelSpanAttributes.TRACE_NAME] as string,
        metadata: {
          ...resourceAttributeMetadata,
          ...this.extractMetadata(attributes, "trace"),
          // removed to not remove trace metadata->attributes through subsequent observations
          // ...(isLangfuseSDKSpans
          //   ? {}
          //   : { attributes: spanAttributesInMetadata }),
          resourceAttributes,
          scope: {
            ...(scopeSpan.scope || {}),
            attributes: scopeAttributes,
          },
        } as Record<string, string | Record<string, string | number>>,
        version:
          (attributes?.[LangfuseOtelSpanAttributes.VERSION] as string) ??
          resourceAttributes?.["service.version"] ??
          null,
        release:
          (attributes?.[LangfuseOtelSpanAttributes.RELEASE] as string) ??
          resourceAttributes?.[LangfuseOtelSpanAttributes.RELEASE] ??
          null,
        userId: this.extractUserId(attributes),
        sessionId: this.extractSessionId(attributes),
        public: this.extractPublic(attributes),
        tags: this.extractTags(attributes),
        environment: this.extractEnvironment(attributes, resourceAttributes),
        input: attributes[LangfuseOtelSpanAttributes.TRACE_INPUT],
        output: attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT],
      };
    }

    if (isRootSpan) {
      this.traceEventCounts.rootSpanClosed += 1;
    } else if (hasTraceUpdates) {
      this.traceEventCounts.traceUpdated += 1;
    } else {
      this.traceEventCounts.shallow += 1;
    }

    return {
      id: randomUUID(),
      type: "trace-create",
      timestamp: new Date(startTimeISO).toISOString(),
      body: trace,
    };
  }

  private extractPublic(
    attributes?: Record<string, unknown>,
  ): boolean | undefined {
    const value =
      attributes?.[LangfuseOtelSpanAttributes.TRACE_PUBLIC] ??
      attributes?.["langfuse.public"];

    if (value == null) return;
    return value === true || value === "true";
  }

  private createObservationEvent(
    params: CreateObservationEventParams,
  ): IngestionEventType {
    const {
      span,
      traceId,
      parentObservationId,
      attributes,
      resourceAttributes,
      resourceAttributeMetadata,
      spanAttributeMetadata,
      scopeSpan,
      scopeAttributes,
      isLangfuseSDKSpans,
      startTimeISO,
      endTimeISO,
    } = params;

    const instrumentationScopeName = scopeSpan?.scope?.name;

    // Extract input/output and get filtered attributes
    const { input, output, filteredAttributes } = this.extractInputAndOutput({
      events: span?.events ?? [],
      attributes,
      instrumentationScopeName,
    });

    const observation = {
      id: this.parseId(span.spanId?.data ?? span.spanId),
      traceId,
      parentObservationId,
      name: this.extractName(span.name, attributes),
      startTime: startTimeISO,
      endTime: endTimeISO,
      environment: this.extractEnvironment(attributes, resourceAttributes),
      completionStartTime: this.extractCompletionStartTime(
        attributes,
        startTimeISO,
      ),
      metadata: {
        ...resourceAttributeMetadata,
        ...spanAttributeMetadata,
        ...(isLangfuseSDKSpans ? {} : { attributes: filteredAttributes }),
        resourceAttributes,
        scope: { ...scopeSpan.scope, attributes: scopeAttributes },
      },
      level:
        attributes[LangfuseOtelSpanAttributes.OBSERVATION_LEVEL] ??
        (span.status?.code === 2
          ? ObservationLevel.ERROR
          : scopeSpan?.scope?.name === "livekit-agents" &&
              LIVEKIT_DEBUG_SPAN_NAMES.has(span.name)
            ? ObservationLevel.DEBUG
            : ObservationLevel.DEFAULT),
      statusMessage:
        attributes[LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE] ??
        span.status?.message ??
        null,
      version:
        attributes[LangfuseOtelSpanAttributes.VERSION] ??
        resourceAttributes?.["service.version"] ??
        null,
      modelParameters: this.extractModelParameters(
        attributes,
        instrumentationScopeName,
      ) as any,
      model: this.extractModelName(attributes),
      promptName:
        attributes?.[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] ??
        attributes["langfuse.prompt.name"] ??
        this.parseLangfusePromptFromAISDK(attributes)?.name ??
        null,
      promptVersion:
        attributes?.[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION] ??
        attributes["langfuse.prompt.version"] ??
        this.parseLangfusePromptFromAISDK(attributes)?.version ??
        null,
      usageDetails: this.extractUsageDetails(
        attributes,
        instrumentationScopeName,
      ),
      costDetails: this.extractCostDetails(attributes),
      input,
      output,
    };

    const mappedObservationType = observationTypeMapper.mapToObservationType(
      attributes,
      resourceAttributes,
      scopeSpan?.scope,
      span.name,
    );
    const observationType =
      mappedObservationType && typeof mappedObservationType === "string"
        ? mappedObservationType.toLowerCase()
        : undefined;

    const isKnownObservationType =
      observationType &&
      ObservationTypeDomain.safeParse(observationType.toUpperCase()).success;

    const getIngestionEventType = (): string => {
      if (isKnownObservationType) {
        return `${observationType}-create`;
      }
      return "span-create";
    };

    return {
      id: randomUUID(),
      type: getIngestionEventType(),
      timestamp: new Date().toISOString(),
      body: observation,
    } as unknown as IngestionEventType;
  }

  private hasTraceUpdates(attributes: Record<string, unknown>): boolean {
    const hasExactMatchingAttributeName = [
      LangfuseOtelSpanAttributes.TRACE_NAME,
      LangfuseOtelSpanAttributes.TRACE_INPUT,
      LangfuseOtelSpanAttributes.TRACE_OUTPUT,
      LangfuseOtelSpanAttributes.TRACE_METADATA,
      LangfuseOtelSpanAttributes.TRACE_USER_ID,
      LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
      LangfuseOtelSpanAttributes.TRACE_PUBLIC,
      LangfuseOtelSpanAttributes.TRACE_TAGS,
      LangfuseOtelSpanAttributes.TRACE_COMPAT_USER_ID,
      LangfuseOtelSpanAttributes.TRACE_COMPAT_SESSION_ID,
      // OpenAI and Langchain integrations
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_user_id`,
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_session_id`,
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_tags`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_session_id`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_user_id`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_tags`,
      // Vercel AI SDK
      `ai.telemetry.metadata.sessionId`,
      `ai.telemetry.metadata.userId`,
      `ai.telemetry.metadata.tags`,
      // LlamaIndex
      `tag.tags`,
    ].some((traceAttribute) => Boolean(attributes[traceAttribute]));

    const attributeKeys = Object.keys(attributes);
    const hasTraceMetadataKey = attributeKeys.some((key) =>
      key.startsWith(LangfuseOtelSpanAttributes.TRACE_METADATA),
    );

    return hasExactMatchingAttributeName || hasTraceMetadataKey;
  }

  private extractResourceAttributes(
    resourceSpan: any,
  ): Record<string, unknown> {
    return (
      resourceSpan?.resource?.attributes?.reduce((acc: any, attr: any) => {
        acc[attr.key] = this.convertValueToPlainJavascript(attr.value);
        return acc;
      }, {}) ?? {}
    );
  }

  private extractScopeAttributes(scopeSpan: any): Record<string, unknown> {
    return (
      scopeSpan?.scope?.attributes?.reduce((acc: any, attr: any) => {
        acc[attr.key] = this.convertValueToPlainJavascript(attr.value);
        return acc;
      }, {}) ?? {}
    );
  }

  private extractSpanAttributes(span: any): Record<string, unknown> {
    return (
      span?.attributes?.reduce((acc: any, attr: any) => {
        acc[attr.key] = this.convertValueToPlainJavascript(attr.value);
        return acc;
      }, {}) ?? {}
    );
  }

  private convertValueToPlainJavascript(value: Record<string, any>): any {
    if (value.stringValue !== undefined) {
      return value.stringValue;
    }
    if (value.doubleValue !== undefined) {
      return value.doubleValue;
    }
    if (value.boolValue !== undefined) {
      return value.boolValue;
    }
    if (value.arrayValue && value.arrayValue.values !== undefined) {
      return value.arrayValue.values.map((v: any) =>
        this.convertValueToPlainJavascript(v),
      );
    }
    if (value.intValue && value.intValue.high === 0) {
      return value.intValue.low;
    }
    if (value.intValue && typeof value.intValue === "number") {
      return value.intValue;
    }
    if (
      value.intValue &&
      value.intValue.high === -1 &&
      value.intValue.low === -1
    ) {
      return -1;
    }
    if (value.intValue && value.intValue.high !== 0) {
      return value.intValue.high * Math.pow(2, 32) + value.intValue.low;
    }
    return JSON.stringify(value);
  }

  private convertKeyPathToNestedObject(
    input: Record<string, unknown>,
    prefix: string,
  ): any {
    if (input[prefix]) {
      return input[prefix];
    }

    const keys = Object.keys(input).map((key) => key.replace(`${prefix}.`, ""));
    const useArray = keys.some((key) => key.match(/^\d+\./));

    // Helper function to set a value at a nested path
    const setNestedValue = (obj: any, path: string[], value: unknown): void => {
      let current = obj;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!(key in current)) {
          // Check if next key is a number to decide if we need an array or object
          current[key] = /^\d+$/.test(path[i + 1]) ? [] : {};
        }
        current = current[key];
      }
      current[path[path.length - 1]] = value;
    };

    if (useArray) {
      const result: any[] = [];
      for (const key of keys) {
        const pathParts = key.split(".");
        const index = parseInt(pathParts[0], 10);
        if (!result[index]) {
          result[index] = {};
        }
        if (pathParts.length === 2) {
          // Simple case: 0.content -> result[0].content
          result[index][pathParts[1]] = input[`${prefix}.${key}`];
        } else {
          // Nested case: 0.message.content -> result[0].message.content
          setNestedValue(
            result[index],
            pathParts.slice(1),
            input[`${prefix}.${key}`],
          );
        }
      }
      return result;
    } else {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        const pathParts = key.split(".");
        if (pathParts.length === 1) {
          result[key] = input[`${prefix}.${key}`];
        } else {
          setNestedValue(result, pathParts, input[`${prefix}.${key}`]);
        }
      }
      return result;
    }
  }

  private extractInputAndOutput(params: {
    events: any[];
    attributes: Record<string, unknown>;
    instrumentationScopeName: string;
    domain?: "trace" | "observation";
  }): { input: any; output: any; filteredAttributes: Record<string, unknown> } {
    const { instrumentationScopeName, events, attributes, domain } = params;

    let input = null;
    let output = null;
    // Create a shallow copy of attributes to filter out used keys
    const rawFilteredAttributes = { ...attributes };

    // Pre-delete all potential input/output attribute keys to avoid duplicates
    // This ensures that if multiple frameworks' attributes are present, they're all filtered
    const potentialInputOutputKeys = [
      // Langfuse SDK
      LangfuseOtelSpanAttributes.TRACE_INPUT,
      LangfuseOtelSpanAttributes.TRACE_OUTPUT,
      LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
      LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
      // Vercel AI SDK
      "ai.prompt.messages",
      "ai.prompt",
      "ai.toolCall.args",
      "ai.response.text",
      "ai.result.text",
      "ai.toolCall.result",
      "ai.response.object",
      "ai.result.object",
      "ai.response.toolCalls",
      "ai.result.toolCalls",
      // Google Vertex AI
      "gcp.vertex.agent.llm_request",
      "gcp.vertex.agent.llm_response",
      "gcp.vertex.agent.tool_call_args",
      "gcp.vertex.agent.tool_response",
      // Logfire
      "prompt",
      "all_messages_events",
      "events",
      // LiveKit
      "lk.input_text",
      "lk.user_transcript",
      "lk.chat_ctx",
      "lk.user_input",
      "lk.function_tool.output",
      "lk.response.text",
      // MLFlow
      "mlflow.spanInputs",
      "mlflow.spanOutputs",
      // TraceLoop
      "traceloop.entity.input",
      "traceloop.entity.output",
      // SmolAgents
      "input.value",
      "output.value",
      // Pydantic AI agent/root span
      "final_result",
      "pydantic_ai.all_messages",
      // Pydantic and Pipecat
      "input",
      "output",
      // OpenTelemetry
      "gen_ai.input.messages",
      "gen_ai.output.messages",
      "gen_ai.tool.call.arguments",
      "gen_ai.tool.call.result",
    ];

    // Delete simple keys
    potentialInputOutputKeys.forEach((key) => {
      delete rawFilteredAttributes[key];
    });

    // Delete gen_ai.prompt.*, gen_ai.completion.*, llm.input_messages.*, and llm.output_messages.* keys
    Object.keys(attributes).forEach((key) => {
      if (
        key.startsWith("gen_ai.prompt") ||
        key.startsWith("gen_ai.completion") ||
        key.startsWith("llm.input_messages") ||
        key.startsWith("llm.output_messages")
      ) {
        delete rawFilteredAttributes[key];
      }
    });

    // Stringify non-string values in filteredAttributes to maintain backward compatibility
    // This matches the old spanAttributesInMetadata behavior
    const filteredAttributes = Object.fromEntries(
      Object.entries(rawFilteredAttributes).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      ]),
    );

    // TODO: Map gen_ai.tool.definitions to input.tools for backend extraction
    // const toolDefs = attributes["gen_ai.tool.definitions"] || attributes["model_request_parameters"]?.function_tools;
    // if (toolDefs && input && typeof input === "object") { input = { ...input, tools: toolDefs }; }

    // Langfuse
    input =
      domain === "trace" && attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]
        ? attributes[LangfuseOtelSpanAttributes.TRACE_INPUT]
        : attributes[LangfuseOtelSpanAttributes.OBSERVATION_INPUT];
    output =
      domain === "trace" && attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT]
        ? attributes[LangfuseOtelSpanAttributes.TRACE_OUTPUT]
        : attributes[LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT];

    if (input != null || output != null) {
      return { input, output, filteredAttributes };
    }

    // Vercel AI SDK
    if (instrumentationScopeName === "ai") {
      input =
        "ai.prompt.messages" in attributes
          ? attributes["ai.prompt.messages"]
          : "ai.prompt" in attributes
            ? attributes["ai.prompt"]
            : "ai.toolCall.args" in attributes
              ? attributes["ai.toolCall.args"]
              : undefined;

      if (
        "ai.response.text" in attributes &&
        "ai.response.toolCalls" in attributes
      ) {
        output = JSON.stringify({
          role: "assistant",
          content: attributes["ai.response.text"],
          tool_calls: attributes["ai.response.toolCalls"],
        });
      } else {
        output =
          "ai.response.text" in attributes &&
          Boolean(attributes["ai.response.text"])
            ? attributes["ai.response.text"]
            : "ai.result.text" in attributes // Legacy support for ai SDK versions < 4.0.0
              ? attributes["ai.result.text"]
              : "ai.toolCall.result" in attributes
                ? attributes["ai.toolCall.result"]
                : "ai.response.object" in attributes
                  ? attributes["ai.response.object"]
                  : "ai.result.object" in attributes // Legacy support for ai SDK versions < 4.0.0
                    ? attributes["ai.result.object"]
                    : "ai.response.toolCalls" in attributes
                      ? attributes["ai.response.toolCalls"]
                      : "ai.result.toolCalls" in attributes // Legacy support for ai SDK versions < 4.0.0
                        ? attributes["ai.result.toolCalls"]
                        : undefined;
      }

      return { input, output, filteredAttributes };
    }

    const inputEvents = events.filter(
      (event: Record<string, unknown>) =>
        event.name === "gen_ai.system.message" ||
        event.name === "gen_ai.user.message" ||
        event.name === "gen_ai.assistant.message" ||
        event.name === "gen_ai.tool.message",
    );

    const outputEvents = events.filter(
      (event: Record<string, unknown>) => event.name === "gen_ai.choice",
    );

    if (inputEvents.length > 0 || outputEvents.length > 0) {
      const processedInput =
        inputEvents.length > 0
          ? inputEvents.map((event: any) => {
              const eventAttributes =
                event.attributes?.reduce((acc: any, attr: any) => {
                  acc[attr.key] = this.convertValueToPlainJavascript(
                    attr.value,
                  );
                  return acc;
                }, {}) ?? {};

              return {
                role: event.name.replace("gen_ai.", "").replace(".message", ""),
                ...eventAttributes,
              };
            })
          : null;

      const processedOutput =
        outputEvents.length > 0
          ? outputEvents.map((event: any) => {
              const eventAttributes =
                event.attributes?.reduce((acc: any, attr: any) => {
                  acc[attr.key] = this.convertValueToPlainJavascript(
                    attr.value,
                  );
                  return acc;
                }, {}) ?? {};

              return eventAttributes;
            })
          : null;

      return {
        input: processedInput,
        output:
          processedOutput && processedOutput.length === 1
            ? processedOutput[0]
            : processedOutput,
        filteredAttributes, // No attribute keys used, events are used instead
      };
    }

    // Legacy semantic kernel event definitions
    input = events.find(
      (event: Record<string, unknown>) =>
        event.name === "gen_ai.content.prompt",
    )?.attributes;

    output = events.find(
      (event: Record<string, unknown>) =>
        event.name === "gen_ai.content.completion",
    )?.attributes;

    if (input || output) {
      input =
        input?.reduce((acc: any, attr: any) => {
          acc[attr.key] = this.convertValueToPlainJavascript(attr.value);
          return acc;
        }, {}) ?? {};
      output =
        output?.reduce((acc: any, attr: any) => {
          acc[attr.key] = this.convertValueToPlainJavascript(attr.value);
          return acc;
        }, {}) ?? {};

      const { input: eventInput } = this.extractInputAndOutput({
        events: [],
        attributes: input,
        instrumentationScopeName,
      });
      const { output: eventOutput } = this.extractInputAndOutput({
        events: [],
        attributes: output,
        instrumentationScopeName,
      });
      return {
        input: eventInput || input,
        output: eventOutput || output,
        filteredAttributes, // No attribute keys used, events are used instead
      };
    }

    // Google Vertex AI Agent-Developer-Kit (ADK)
    input = attributes["gcp.vertex.agent.llm_request"];
    output = attributes["gcp.vertex.agent.llm_response"];
    // GCP Vertex Agent Tool call input and output
    // see: https://github.com/google/adk-python/blob/9dce06f9b00259ec42241df4f6638955e783a9d1/src/google/adk/telemetry/tracing.py#L142
    // Google sets llm_request and llm_response to {} when setting tool_call_args and tool_response
    if (input === "{}" || !input) {
      input = attributes["gcp.vertex.agent.tool_call_args"];
    }
    if (output === "{}" || !output) {
      output = attributes["gcp.vertex.agent.tool_response"];
    }
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // Logfire uses `prompt` and `all_messages_events` property on spans
    input = attributes["prompt"];
    output = attributes["all_messages_events"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // LiveKit
    input =
      attributes["lk.input_text"] ??
      attributes["lk.user_transcript"] ??
      attributes["lk.chat_ctx"];
    output =
      attributes["lk.function_tool.output"] || attributes["lk.response.text"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // Logfire uses single `events` array for GenAI events
    const eventsArray = attributes["events"];
    if (typeof eventsArray === "string" || Array.isArray(eventsArray)) {
      let events = eventsArray as any[];
      if (typeof eventsArray === "string") {
        try {
          events = JSON.parse(eventsArray);
        } catch {
          events = [];
        }
      }

      const choiceEvent = events.find(
        (event) => event["event.name"] === "gen_ai.choice",
      );
      const inputEvents = events.filter(
        (event) => event["event.name"] !== "gen_ai.choice",
      );

      if (choiceEvent || inputEvents.length > 0) {
        return {
          input: inputEvents.length > 0 ? inputEvents : null,
          output: choiceEvent || null,
          filteredAttributes,
        };
      }
    }

    // MLFlow sets mlflow.spanInputs and mlflow.spanOutputs
    input = attributes["mlflow.spanInputs"];
    output = attributes["mlflow.spanOutputs"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // TraceLoop sets traceloop.entity.input and traceloop.entity.output
    input = attributes["traceloop.entity.input"];
    output = attributes["traceloop.entity.output"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // SmolAgents sets input.value and output.value
    input = attributes["input.value"];
    output = attributes["output.value"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // Pydantic and Pipecat uses input and output
    input = attributes["input"];
    output = attributes["output"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // Pydantic AI agent/root span: all_messages → input, final_result → output
    if (instrumentationScopeName === "pydantic-ai") {
      input = attributes["pydantic_ai.all_messages"] ?? null;
      output = attributes["final_result"] ?? null;
      if (input || output) {
        return { input, output, filteredAttributes };
      }
    }

    // Pydantic-AI uses tool_arguments and tool_response for tool call input/output
    input = attributes["tool_arguments"];
    output = attributes["tool_response"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // TraceLoop uses attributes property
    const inputAttributes = Object.keys(attributes).filter((key) =>
      key.startsWith("gen_ai.prompt"),
    );
    const outputAttributes = Object.keys(attributes).filter((key) =>
      key.startsWith("gen_ai.completion"),
    );
    if (inputAttributes.length > 0 || outputAttributes.length > 0) {
      input = inputAttributes.reduce((acc: any, key) => {
        acc[key] = attributes[key];
        return acc;
      }, {});
      output = outputAttributes.reduce((acc: any, key) => {
        acc[key] = attributes[key];
        return acc;
      }, {});
      return {
        input: this.convertKeyPathToNestedObject(input, "gen_ai.prompt"),
        output: this.convertKeyPathToNestedObject(output, "gen_ai.completion"),
        filteredAttributes,
      };
    }

    // OpenInference llm.input_messages and llm.output_messages (used by Agno, BeeAI, etc.)
    const llmInputAttributes = Object.keys(attributes).filter((key) =>
      key.startsWith("llm.input_messages"),
    );
    const llmOutputAttributes = Object.keys(attributes).filter((key) =>
      key.startsWith("llm.output_messages"),
    );
    if (llmInputAttributes.length > 0 || llmOutputAttributes.length > 0) {
      const llmInput = llmInputAttributes.reduce((acc: any, key) => {
        acc[key] = attributes[key];
        return acc;
      }, {});
      const llmOutput = llmOutputAttributes.reduce((acc: any, key) => {
        acc[key] = attributes[key];
        return acc;
      }, {});
      return {
        input: this.convertKeyPathToNestedObject(
          llmInput,
          "llm.input_messages",
        ),
        output: this.convertKeyPathToNestedObject(
          llmOutput,
          "llm.output_messages",
        ),
        filteredAttributes,
      };
    }

    // OpenTelemetry messages (https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans)
    input = attributes["gen_ai.input.messages"];
    output = attributes["gen_ai.output.messages"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    // OpenTelemetry tools (https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans)
    input = attributes["gen_ai.tool.call.arguments"];
    output = attributes["gen_ai.tool.call.result"];
    if (input || output) {
      return { input, output, filteredAttributes };
    }

    return { input: null, output: null, filteredAttributes };
  }

  private extractEnvironment(
    attributes: Record<string, unknown>,
    resourceAttributes: Record<string, unknown>,
  ): string {
    const environmentAttributeKeys = [
      LangfuseOtelSpanAttributes.ENVIRONMENT,
      "deployment.environment.name",
      "deployment.environment",
    ];

    for (const key of environmentAttributeKeys) {
      if (attributes[key]) {
        return attributes[key] as string;
      }
      if (resourceAttributes[key]) {
        return resourceAttributes[key] as string;
      }
    }

    return "default";
  }

  private extractName(
    spanName: string,
    attributes: Record<string, unknown>,
  ): string {
    // GenAI tool name (standard OTel GenAI attribute)
    if ("gen_ai.tool.name" in attributes && attributes["gen_ai.tool.name"]) {
      return typeof attributes["gen_ai.tool.name"] === "string"
        ? (attributes["gen_ai.tool.name"] as string)
        : JSON.stringify(attributes["gen_ai.tool.name"]);
    }

    // Logfire message for pydantic AI
    const nameKeys = ["logfire.msg"];
    for (const key of nameKeys) {
      if (attributes[key]) {
        return typeof attributes[key] === "string"
          ? (attributes[key] as string)
          : JSON.stringify(attributes[key]);
      }
    }

    // Vercel AI SDK
    if ("ai.toolCall.name" in attributes) {
      return attributes["ai.toolCall.name"] as string;
    }

    const functionIdAttribute = "ai.telemetry.functionId";
    const operationIdAttribute = "ai.operationId";

    if (operationIdAttribute in attributes) {
      const prefix = attributes[functionIdAttribute]
        ? attributes[functionIdAttribute] + ":"
        : "";

      return prefix + attributes[operationIdAttribute];
    }

    return spanName;
  }

  private extractMetadata(
    attributes: Record<string, unknown>,
    domain: "trace" | "observation",
  ): Record<string, unknown> {
    let topLevelMetadata: Record<string, unknown> = {};

    const metadataKeyPrefix =
      domain === "observation"
        ? LangfuseOtelSpanAttributes.OBSERVATION_METADATA
        : LangfuseOtelSpanAttributes.TRACE_METADATA;

    const langfuseMetadataAttribute =
      attributes[metadataKeyPrefix] || attributes["langfuse.metadata"];

    if (langfuseMetadataAttribute) {
      try {
        if (typeof langfuseMetadataAttribute === "string") {
          topLevelMetadata = JSON.parse(langfuseMetadataAttribute as string);
        } else if (typeof langfuseMetadataAttribute === "object") {
          topLevelMetadata = langfuseMetadataAttribute as Record<
            string,
            unknown
          >;
        }
      } catch {
        // Continue with nested metadata extraction
      }
    }

    const langfuseMetadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes)) {
      for (const prefix of [
        metadataKeyPrefix,
        "langfuse.metadata",
        "ai.telemetry.metadata",
      ]) {
        if (
          key.startsWith(`${prefix}.`) &&
          // Filter out the Vercel AI SDK trace attribute keys
          ![
            "ai.telemetry.metadata.userId",
            "ai.telemetry.metadata.sessionId",
            "ai.telemetry.metadata.tags",
            "ai.telemetry.metadata.langfusePrompt",
          ].includes(key)
        ) {
          const newKey = key.replace(`${prefix}.`, "");
          langfuseMetadata[newKey] = value;
        }
      }
    }

    // Vercel AI SDK
    const tools =
      "ai.prompt.tools" in attributes
        ? attributes["ai.prompt.tools"]
        : undefined;

    if (tools) {
      langfuseMetadata["tools"] = tools;
    }

    return {
      ...topLevelMetadata,
      ...langfuseMetadata,
    };
  }

  private extractUserId(
    attributes: Record<string, unknown>,
  ): string | undefined {
    const userIdKeys = [
      "langfuse.user.id",
      "user.id",
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_user_id`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_user_id`,
      `ai.telemetry.metadata.userId`,
    ];

    for (const key of userIdKeys) {
      if (attributes[key]) {
        return typeof attributes[key] === "string"
          ? (attributes[key] as string)
          : JSON.stringify(attributes[key]);
      }
    }
  }

  private extractSessionId(
    attributes: Record<string, unknown>,
  ): string | undefined {
    const userIdKeys = [
      "langfuse.session.id",
      "session.id",
      "gen_ai.conversation.id",
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_session_id`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_session_id`,
      `ai.telemetry.metadata.sessionId`,
    ];

    for (const key of userIdKeys) {
      if (attributes[key]) {
        return typeof attributes[key] === "string"
          ? (attributes[key] as string)
          : JSON.stringify(attributes[key]);
      }
    }
  }

  private extractModelParameters(
    attributes: Record<string, unknown>,
    instrumentationScopeName: string,
  ): Record<string, unknown> {
    if (attributes[LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS]) {
      try {
        return this.sanitizeModelParams(
          JSON.parse(
            attributes[
              LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS
            ] as string,
          ),
        );
      } catch {
        // Fallthrough
      }
    }

    // Vercel AI SDK
    if (instrumentationScopeName === "ai") {
      return {
        maxSteps:
          "ai.settings.maxSteps" in attributes
            ? (attributes["ai.settings.maxSteps"]?.toString() ?? null)
            : null,
        toolChoice:
          "ai.prompt.toolChoice" in attributes
            ? (attributes["ai.prompt.toolChoice"]?.toString() ?? null)
            : null,
        maxTokens:
          "gen_ai.request.max_tokens" in attributes
            ? (attributes["gen_ai.request.max_tokens"]?.toString() ?? null)
            : null,
        finishReason:
          "gen_ai.response.finish_reasons" in attributes
            ? (attributes["gen_ai.response.finish_reasons"]?.toString() ?? null)
            : "gen_ai.finishReason" in attributes //  Legacy support for ai SDK versions < 4.0.0
              ? (attributes["gen_ai.finishReason"]?.toString() ?? null)
              : null,
        system:
          "gen_ai.system" in attributes
            ? (attributes["gen_ai.system"]?.toString() ?? null)
            : "ai.model.provider" in attributes
              ? (attributes["ai.model.provider"]?.toString() ?? null)
              : null,
        maxRetries:
          "ai.settings.maxRetries" in attributes
            ? (attributes["ai.settings.maxRetries"]?.toString() ?? null)
            : null,
        mode:
          "ai.settings.mode" in attributes
            ? (attributes["ai.settings.mode"]?.toString() ?? null)
            : null,
        temperature:
          "gen_ai.request.temperature" in attributes
            ? (attributes["gen_ai.request.temperature"]?.toString() ?? null)
            : null,
      };
    }

    if (attributes["llm.invocation_parameters"]) {
      try {
        return this.sanitizeModelParams(
          JSON.parse(attributes["llm.invocation_parameters"] as string),
        );
      } catch {
        // fallthrough
      }
    }

    if (attributes["model_config"]) {
      try {
        return this.sanitizeModelParams(
          JSON.parse(attributes["model_config"] as string),
        );
      } catch {
        // fallthrough
      }
    }

    const modelParameters = Object.keys(attributes).filter((key) =>
      key.startsWith("gen_ai.request."),
    );

    return this.sanitizeModelParams(
      modelParameters.reduce((acc: any, key) => {
        const modelParamKey = key.replace("gen_ai.request.", "");
        if (modelParamKey !== "model") {
          acc[modelParamKey] = attributes[key];
        }
        return acc;
      }, {}),
    );
  }

  private sanitizeModelParams<T>(params: T): Record<string, string> | T {
    // Model params in Langfuse must be key value pairs where value is string
    if (typeof params === "object" && params != null)
      return Object.fromEntries(
        Object.entries(params).map((e) => [
          e[0],
          ["string", "number"].includes(typeof e[1])
            ? e[1]
            : JSON.stringify(e[1]),
        ]),
      );

    return params;
  }

  private extractModelName(
    attributes: Record<string, unknown>,
  ): string | undefined {
    const modelNameKeys = [
      LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
      "gen_ai.response.model",
      "ai.model.id",
      "gen_ai.request.model",
      "llm.response.model",
      "llm.model_name",
      "model",
    ];
    for (const key of modelNameKeys) {
      if (attributes[key]) {
        return typeof attributes[key] === "string"
          ? (attributes[key] as string)
          : JSON.stringify(attributes[key]);
      }
    }
  }

  private extractUsageDetails(
    attributes: Record<string, unknown>,
    instrumentationScopeName: string,
  ): Record<string, unknown> {
    if (attributes[LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS]) {
      try {
        return JSON.parse(
          attributes[
            LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS
          ] as string,
        );
      } catch {
        // Fallthrough
      }
    }

    if (instrumentationScopeName === "ai") {
      try {
        const usageDetails: Record<string, number | undefined> = {
          input:
            "gen_ai.usage.prompt_tokens" in attributes // Backward compat, input_tokens used in latest ai SDK versions
              ? parseInt(
                  attributes["gen_ai.usage.prompt_tokens"]?.toString() ?? "0",
                )
              : "gen_ai.usage.input_tokens" in attributes
                ? parseInt(
                    attributes["gen_ai.usage.input_tokens"]?.toString() ?? "0",
                  )
                : undefined,

          output:
            "gen_ai.usage.completion_tokens" in attributes // Backward compat, output_tokens used in latest ai SDK versions
              ? parseInt(
                  attributes["gen_ai.usage.completion_tokens"]?.toString() ??
                    "0",
                )
              : "gen_ai.usage.output_tokens" in attributes
                ? parseInt(
                    attributes["gen_ai.usage.output_tokens"]?.toString() ?? "0",
                  )
                : undefined,
          total:
            "ai.usage.tokens" in attributes
              ? parseInt(attributes["ai.usage.tokens"]?.toString() ?? "0")
              : undefined,
        };

        const providerMetadata = attributes["ai.response.providerMetadata"];

        // Try reading token details from ai.usage
        if (
          ["ai.usage.cachedInputTokens", "ai.usage.reasoningTokens"].some((k) =>
            Object.keys(attributes).includes(k),
          )
        ) {
          if ("ai.usage.cachedInputTokens" in attributes) {
            const value = attributes["ai.usage.cachedInputTokens"] as string;
            const parsed = JSON.parse(value);

            usageDetails["input_cached_tokens"] =
              typeof parsed === "number" ? parsed : JSON.parse(value).intValue;
          }
          if ("ai.usage.reasoningTokens" in attributes) {
            const value = attributes["ai.usage.reasoningTokens"] as string;
            const parsed = JSON.parse(value);

            usageDetails["output_reasoning_tokens"] =
              typeof parsed === "number" ? parsed : JSON.parse(value).intValue;
          }
        }

        // Add additional usage details from provider metadata
        if (providerMetadata) {
          const parsed = JSON.parse(providerMetadata as string);

          if ("openai" in parsed) {
            const openaiMetadata = parsed["openai"] as Record<string, number>;

            usageDetails["input_cached_tokens"] ??=
              openaiMetadata["cachedPromptTokens"];
            usageDetails["accepted_prediction_tokens"] ??=
              openaiMetadata["acceptedPredictionTokens"];
            usageDetails["rejected_prediction_tokens"] ??=
              openaiMetadata["rejectedPredictionTokens"];
            usageDetails["output_reasoning_tokens"] ??=
              openaiMetadata["reasoningTokens"];
          }

          // "ai.response.providerMetadata": {"anthropic":{"usage":{"input_tokens":7,"cache_creation_input_tokens":2089,"cache_read_input_tokens":16399,"cache_creation":{"ephemeral_5m_input_tokens":2089,"ephemeral_1h_input_tokens":0},"output_tokens":445,"service_tier":"standard"},"cacheCreationInputTokens":2089,"stopSequence":null,"container":null,"contextManagement":null}}
          if ("anthropic" in parsed && "usage" in parsed["anthropic"]) {
            const anthropicMetadata = parsed["anthropic"]["usage"] as Record<
              string,
              number
            >;

            usageDetails["input_cache_creation"] ??=
              anthropicMetadata["cache_creation_input_tokens"];
            usageDetails["input_cached_tokens"] ??=
              anthropicMetadata["cache_read_input_tokens"];
          }

          // Bedrock provider metadata extraction
          // "ai.response.providerMetadata": "{\"bedrock\":{\"usage\":{\"cacheReadInputTokens\":4482,\"cacheWriteInputTokens\":0,\"cacheCreationInputTokens\":0}}}"
          if ("bedrock" in parsed) {
            const bedrockMetadata = parsed["bedrock"] as Record<string, any>;

            if (bedrockMetadata["usage"]) {
              const usage = bedrockMetadata["usage"] as Record<string, number>;

              if (usage["cacheReadInputTokens"] !== undefined) {
                usageDetails["input_cache_read"] ??=
                  usage["cacheReadInputTokens"];
              }
              if (usage["cacheWriteInputTokens"] !== undefined) {
                usageDetails["input_cache_write"] ??=
                  usage["cacheWriteInputTokens"];
              }
              if (usage["cacheCreationInputTokens"] !== undefined) {
                usageDetails["input_cache_creation"] ??=
                  usage["cacheCreationInputTokens"];
              }
            }
          }
        }

        // Subtract cached token count from total input and output
        usageDetails["input"] = Math.max(
          (usageDetails["input"] ?? 0) -
            (usageDetails["input_cached_tokens"] ?? 0) -
            (usageDetails["input_cache_creation"] ?? 0) -
            (usageDetails["input_cache_read"] ?? 0),
          0,
        );

        usageDetails["output"] = Math.max(
          (usageDetails["output"] ?? 0) -
            (usageDetails["output_reasoning_tokens"] ?? 0),
          0,
        );

        return usageDetails;
      } catch {
        // Fallthrough
      }
    }

    if (instrumentationScopeName === "pydantic-ai") {
      const inputTokens = attributes["gen_ai.usage.input_tokens"];
      const outputTokens = attributes["gen_ai.usage.output_tokens"];
      const cacheReadTokens =
        attributes["gen_ai.usage.cache_read_tokens"] ??
        attributes["gen_ai.usage.details.cache_read_input_tokens"];
      const cacheWriteTokens =
        attributes["gen_ai.usage.cache_write_tokens"] ??
        attributes["gen_ai.usage.details.cache_creation_input_tokens"];

      return {
        input: inputTokens,
        output: outputTokens,
        input_cache_read: cacheReadTokens,
        input_cache_creation: cacheWriteTokens,
      };
    }

    const usageDetails = Object.keys(attributes).filter(
      (key) =>
        (key.startsWith("gen_ai.usage.") && key !== "gen_ai.usage.cost") ||
        key.startsWith("llm.token_count"),
    );

    const usageDetailKeyMapping: Record<string, string> = {
      prompt_tokens: "input",
      completion_tokens: "output",
      total_tokens: "total",
      input_tokens: "input",
      output_tokens: "output",
      prompt: "input",
      completion: "output",
    };

    return usageDetails.reduce((acc: any, key) => {
      const usageDetailKey = key
        .replace("gen_ai.usage.", "")
        .replace("llm.token_count.", "");
      const mappedUsageDetailKey =
        usageDetailKeyMapping[usageDetailKey] ?? usageDetailKey;
      const value = Number(attributes[key]);
      if (!Number.isNaN(value)) {
        acc[mappedUsageDetailKey] = value;
      }
      return acc;
    }, {});
  }

  private extractCostDetails(
    attributes: Record<string, unknown>,
  ): Record<string, unknown> {
    if (attributes[LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS]) {
      try {
        return JSON.parse(
          attributes[
            LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS
          ] as string,
        );
      } catch {
        // Fallthrough
      }
    }

    if (attributes["gen_ai.usage.cost"]) {
      return { total: attributes["gen_ai.usage.cost"] };
    }
    return {};
  }

  private extractCompletionStartTime(
    attributes: Record<string, unknown>,
    startTimeISO?: string,
  ): string | null {
    try {
      const value = attributes[
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
      ] as any;

      if (isValidDateString(value)) return value;

      // Older SDKs have double stringified timestamps that need JSON parsing
      // "\"2025-10-01T08:45:26.112648Z\""
      const parsed = JSON.parse(value);
      if (isValidDateString(parsed)) return parsed;
    } catch {
      // Fallthrough
    }

    // Vercel AI SDK
    try {
      const msToFirstChunk =
        attributes["ai.response.msToFirstChunk"] ??
        attributes["ai.stream.msToFirstChunk"];
      if (msToFirstChunk && startTimeISO) {
        const msToFirstChunkNumber = Math.ceil(Number(msToFirstChunk));

        const startTimeUnix = new Date(startTimeISO).getTime();

        return new Date(startTimeUnix + msToFirstChunkNumber).toISOString();
      }
    } catch {
      // Fallthrough
    }

    return null;
  }

  private extractTags(attributes: Record<string, unknown>): string[] {
    const tagsValue =
      attributes[LangfuseOtelSpanAttributes.TRACE_TAGS] ||
      attributes["langfuse.tags"] ||
      attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_tags`
      ] ||
      attributes[
        `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_tags`
      ] ||
      attributes["ai.telemetry.metadata.tags"] ||
      attributes["tag.tags"];

    if (tagsValue === undefined || tagsValue === null) {
      return [];
    }

    if (Array.isArray(tagsValue)) {
      return tagsValue.map((tag) => String(tag));
    }

    if (typeof tagsValue === "string" && tagsValue.trim().startsWith("[")) {
      try {
        const parsedTags = JSON.parse(tagsValue);
        if (Array.isArray(parsedTags)) {
          return parsedTags.map((tag) => String(tag));
        }
      } catch {
        // Continue with other methods
      }
    }

    if (typeof tagsValue === "string" && tagsValue.includes(",")) {
      return tagsValue.split(",").map((tag) => tag.trim());
    }

    if (typeof tagsValue === "string") {
      return [tagsValue];
    }

    return [];
  }

  /**
   * Extracts experiment-related fields from span attributes.
   * Returns undefined for fields that are not present.
   */
  private extractExperimentFields(attributes: Record<string, unknown>): {
    experimentId?: string;
    experimentName?: string;
    experimentDescription?: string;
    experimentDatasetId?: string;
    experimentItemId?: string;
    experimentItemVersion?: string;
    experimentItemRootSpanId?: string;
    experimentItemExpectedOutput?: string;
    experimentMetadataNames?: string[];
    experimentMetadataValues?: Array<string | null | undefined>;
    experimentItemMetadataNames?: string[];
    experimentItemMetadataValues?: Array<string | null | undefined>;
  } {
    const experimentId = attributes[LangfuseOtelSpanAttributes.EXPERIMENT_ID];
    const experimentName =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_NAME];
    const experimentDescription =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_DESCRIPTION];
    const experimentDatasetId =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_DATASET_ID];
    const experimentItemId =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_ID];
    const experimentItemRootSpanId =
      attributes[
        LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_ROOT_OBSERVATION_ID
      ];
    const experimentItemExpectedOutput =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_EXPECTED_OUTPUT];
    const experimentItemVersion =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_VERSION];

    // Extract experiment metadata
    const experimentMetadataStr =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_METADATA];
    let experimentMetadata: Record<string, unknown> = {};
    if (experimentMetadataStr && typeof experimentMetadataStr === "string") {
      try {
        experimentMetadata = JSON.parse(experimentMetadataStr);
      } catch {
        // If parsing fails, treat as empty
      }
    }
    const experimentMetadataFlattened =
      flattenJsonToPathArrays(experimentMetadata);

    // Extract experiment item metadata
    const experimentItemMetadataStr =
      attributes[LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_METADATA];
    let experimentItemMetadata: Record<string, unknown> = {};
    if (
      experimentItemMetadataStr &&
      typeof experimentItemMetadataStr === "string"
    ) {
      try {
        experimentItemMetadata = JSON.parse(experimentItemMetadataStr);
      } catch {
        // If parsing fails, treat as empty
      }
    }
    const experimentItemMetadataFlattened = flattenJsonToPathArrays(
      experimentItemMetadata,
    );

    return {
      experimentId: experimentId ? String(experimentId) : undefined,
      experimentName: experimentName ? String(experimentName) : undefined,
      experimentDescription: experimentDescription
        ? String(experimentDescription)
        : undefined,
      experimentDatasetId: experimentDatasetId
        ? String(experimentDatasetId)
        : undefined,
      experimentItemId: experimentItemId ? String(experimentItemId) : undefined,
      experimentItemVersion: experimentItemVersion
        ? String(experimentItemVersion)
        : undefined,
      experimentItemRootSpanId: experimentItemRootSpanId
        ? String(experimentItemRootSpanId)
        : undefined,
      experimentItemExpectedOutput: experimentItemExpectedOutput
        ? String(experimentItemExpectedOutput)
        : undefined,
      experimentMetadataNames:
        experimentMetadataFlattened.names.length > 0
          ? experimentMetadataFlattened.names
          : undefined,
      experimentMetadataValues:
        experimentMetadataFlattened.values.length > 0
          ? experimentMetadataFlattened.values
          : undefined,
      experimentItemMetadataNames:
        experimentItemMetadataFlattened.names.length > 0
          ? experimentItemMetadataFlattened.names
          : undefined,
      experimentItemMetadataValues:
        experimentItemMetadataFlattened.values.length > 0
          ? experimentItemMetadataFlattened.values
          : undefined,
    };
  }

  private parseLangfusePromptFromAISDK(
    attributes: Record<string, unknown>,
  ): { name: string; version: number } | undefined {
    const aiSDKPrompt = attributes["ai.telemetry.metadata.langfusePrompt"];

    if (!aiSDKPrompt) return;

    try {
      const parsed = JSON.parse(aiSDKPrompt as string);

      return typeof parsed === "object" ? parsed : undefined;
    } catch {
      // Fallthrough
    }
  }
  /**
   * Get a set of trace IDs that have been seen recently (from Redis cache).
   * Returns a Set of trace IDs that should not trigger new trace creation.
   */
  private async getSeenTracesSet(resourceSpans: unknown): Promise<Set<string>> {
    if (!redis) {
      logger.warn("Redis client not available");
      return new Set();
    }

    const traceIds: Set<string> = new Set();
    if (Array.isArray(resourceSpans)) {
      resourceSpans.forEach((resourceSpan) => {
        for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
          for (const span of scopeSpan?.spans ?? []) {
            traceIds.add(this.parseId(span.traceId?.data ?? span.traceId));
          }
        }
      });
    }

    try {
      const results = await Promise.all(
        [...traceIds].map(async (traceId) => {
          const key = `langfuse:project:${this.projectId}:trace:${traceId}:seen`;
          const TTLSeconds = 600; // 10 minutes
          const result = await redis?.set(key, "1", "EX", TTLSeconds, "NX");

          return {
            traceId: traceId,
            wasSeen: result !== "OK", // Redis returns "OK" if key did not exist, i.e. trace was NOT seen in last TTL seconds
          };
        }),
      );

      const seenTraceIds: Set<string> = new Set();
      results.forEach((r) => {
        if (r.wasSeen) {
          seenTraceIds.add(r.traceId);
        }
      });

      return seenTraceIds;
    } catch (error) {
      // Redis error will be captured by parent span, just log and continue
      logger.error("Redis operation failed in getSeenTracesSet:", error);

      // Return empty set to continue processing (fail-safe behavior)
      return new Set();
    }
  }

  private parseId(data: any): string {
    // JS SDK sends IDs already in hex strings
    // Python SDK sends Int array
    return typeof data === "string" ? data : Buffer.from(data).toString("hex");
  }

  /**
   * Convert OpenTelemetry nano timestamp to ISO string.
   * Handles various timestamp formats: string, number, or object with high/low bits.
   */
  public static convertNanoTimestampToISO(
    timestamp: NanoTimestamp,
    field: TimestampField = "unknown",
  ): string | undefined {
    try {
      if (timestamp == null) {
        OtelIngestionProcessor.recordConversionFailure(
          "timestamp_missing",
          field,
        );
        return undefined;
      }

      if (typeof timestamp === "string") {
        if (timestamp.trim() === "") {
          OtelIngestionProcessor.recordConversionFailure(
            "timestamp_invalid_empty_string",
            field,
          );
          return undefined;
        }

        const millisBigInt = BigInt(timestamp) / BigInt(1_000_000);
        return new Date(Number(millisBigInt)).toISOString();
      }

      if (typeof timestamp === "number") {
        if (!Number.isFinite(timestamp)) {
          OtelIngestionProcessor.recordConversionFailure(
            "timestamp_invalid_number",
            field,
          );
          return undefined;
        }

        return new Date(timestamp / 1e6).toISOString();
      }

      if (
        typeof timestamp.high !== "number" ||
        typeof timestamp.low !== "number"
      ) {
        OtelIngestionProcessor.recordConversionFailure(
          "timestamp_invalid_object",
          field,
        );
        return undefined;
      }

      // Convert high and low to BigInt
      const highBits = BigInt(timestamp.high) << BigInt(32);
      const lowBits = BigInt(timestamp.low >>> 0);

      // Combine high and low bits
      const nanosBigInt = highBits | lowBits;

      // Convert nanoseconds to milliseconds for JavaScript Date
      const millisBigInt = nanosBigInt / BigInt(1000000);
      return new Date(Number(millisBigInt)).toISOString();
    } catch (e) {
      logger.warn(`Failed to convert nanotimestamp to ISO`, {
        timestamp,
        error: e,
      });
      OtelIngestionProcessor.recordConversionFailure(
        typeof timestamp === "string"
          ? "timestamp_invalid_string"
          : "timestamp_conversion_exception",
        field,
      );
      return undefined;
    }
  }

  /**
   * Ensure a stable time range for spans even if a timestamp is missing.
   * If one edge is missing, use the other edge. If both are missing, use current time.
   */
  private static resolveSpanTimestamps(params: {
    startTimeUnixNano?: NanoTimestamp;
    endTimeUnixNano?: NanoTimestamp;
  }): { startTimeISO: string; endTimeISO: string } {
    const startTimeISO = OtelIngestionProcessor.convertNanoTimestampToISO(
      params.startTimeUnixNano,
      "start_time",
    );
    const endTimeISO = OtelIngestionProcessor.convertNanoTimestampToISO(
      params.endTimeUnixNano,
      "end_time",
    );
    const fallbackISO = new Date().toISOString();

    if (!startTimeISO && endTimeISO) {
      OtelIngestionProcessor.recordConversionFailure(
        "timestamp_inferred_start_from_end",
        "start_time",
      );
    } else if (startTimeISO && !endTimeISO) {
      OtelIngestionProcessor.recordConversionFailure(
        "timestamp_inferred_end_from_start",
        "end_time",
      );
    } else if (!startTimeISO && !endTimeISO) {
      OtelIngestionProcessor.recordConversionFailure(
        "timestamp_inferred_both_missing",
      );
    }

    return {
      startTimeISO: startTimeISO ?? endTimeISO ?? fallbackISO,
      endTimeISO: endTimeISO ?? startTimeISO ?? fallbackISO,
    };
  }

  private static recordConversionFailure(
    failureType: string,
    field: TimestampField = "unknown",
  ): void {
    recordIncrement(OtelIngestionProcessor.OTEL_CONVERSION_FAILURE_METRIC, 1, {
      failure_type: failureType,
      timestamp_field: field,
    });
  }

  /**
   * Count the total number of spans across all resource spans.
   * Returns -1 if an error occurs during counting to avoid throwing exceptions.
   */
  private getTotalSpanCount(resourceSpans: ResourceSpan[]): number {
    try {
      if (!Array.isArray(resourceSpans)) {
        return 0;
      }

      return resourceSpans.reduce((total, resourceSpan) => {
        if (!resourceSpan?.scopeSpans) {
          return total;
        }

        return (
          total +
          resourceSpan.scopeSpans.reduce((count, scopeSpan) => {
            return count + (scopeSpan?.spans?.length ?? 0);
          }, 0)
        );
      }, 0);
    } catch (error) {
      // Log error but never throw - return -1 to indicate counting failed
      logger.warn("Failed to count total spans:", error);
      return -1;
    }
  }
}
