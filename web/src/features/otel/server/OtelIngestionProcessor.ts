import { randomUUID } from "crypto";

import { ForbiddenError, ObservationLevel } from "@langfuse/shared";
import {
  type TraceEventType,
  type IngestionEventType,
  redis,
  logger,
  instrumentAsync,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";

import { LangfuseOtelSpanAttributes } from "./attributes";

// Type definitions for internal processor state
interface TraceState {
  hasFullTrace: boolean;
  shallowEventIds: string[];
}

export interface OtelIngestionProcessorConfig {
  projectId: string;
  publicKey?: string;
}

interface CreateTraceEventParams {
  traceId: string;
  startTimeISO: string;
  attributes: Record<string, unknown>;
  resourceAttributes: Record<string, unknown>;
  resourceAttributeMetadata: Record<string, unknown>;
  spanAttributesInMetadata: Record<string, unknown>;
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
  spanAttributesInMetadata: Record<string, unknown>;
  scopeSpan: any;
  scopeAttributes: Record<string, unknown>;
  isLangfuseSDKSpans: boolean;
  startTimeISO: string;
  endTimeISO: string;
}

interface ResourceSpan {
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
      startTimeUnixNano: number | { low: number; high: number };
      endTimeUnixNano: number | { low: number; high: number };
      attributes?: Array<{ key: string; value: any }>;
      events?: any[];
      status?: { code?: number; message?: string };
    }>;
  }>;
}

/**
 * Processor class that encapsulates all logic for converting OpenTelemetry
 * resource spans into Langfuse ingestion events.
 *
 * Manages trace deduplication internally and provides a clean interface
 * for converting OTEL spans to Langfuse events.
 */
export class OtelIngestionProcessor {
  private seenTraces: Set<string> = new Set();
  private isInitialized = false;
  private traceEventCounts = {
    shallow: 0,
    rootSpanClosed: 0,
    traceUpdated: 0,
  };
  private readonly projectId: string;
  private readonly publicKey?: string;

  constructor(config: OtelIngestionProcessorConfig) {
    this.projectId = config.projectId;
    this.publicKey = config.publicKey;
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

      this.validatePublicKey(
        isLangfuseSDKSpans,
        scopeAttributes,
        resourceAttributes,
      );

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
    const startTimeISO = OtelIngestionProcessor.convertNanoTimestampToISO(
      span.startTimeUnixNano,
    );
    const endTimeISO = OtelIngestionProcessor.convertNanoTimestampToISO(
      span.endTimeUnixNano,
    );

    const isRootSpan =
      !parentObservationId ||
      String(attributes[LangfuseOtelSpanAttributes.AS_ROOT]) === "true";

    const spanAttributesInMetadata = Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      ]),
    );

    const hasTraceUpdates = this.hasTraceUpdates(attributes);

    // Handle trace creation logic with internal seen traces management
    if (isRootSpan || hasTraceUpdates || !this.seenTraces.has(traceId)) {
      const traceEvent = this.createTraceEvent({
        traceId,
        startTimeISO,
        attributes,
        resourceAttributes,
        resourceAttributeMetadata,
        spanAttributesInMetadata,
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
      spanAttributesInMetadata,
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
      spanAttributesInMetadata,
      scopeSpan,
      scopeAttributes,
      isLangfuseSDKSpans,
      isRootSpan,
      hasTraceUpdates,
      parentObservationId,
      span,
    } = params;

    // Create shallow trace for new traces without root span or trace updates
    let trace: TraceEventType["body"] = {
      id: traceId,
      timestamp: startTimeISO,
      environment: this.extractEnvironment(attributes, resourceAttributes),
    };

    // Create full trace for root spans or spans with trace updates
    if (isRootSpan || hasTraceUpdates) {
      trace = {
        ...trace,
        name:
          (attributes[LangfuseOtelSpanAttributes.TRACE_NAME] as string) ??
          (!parentObservationId
            ? this.extractName(span.name, attributes)
            : undefined),
        metadata: {
          ...resourceAttributeMetadata,
          ...this.extractMetadata(attributes, "trace"),
          ...(isLangfuseSDKSpans
            ? {}
            : { attributes: spanAttributesInMetadata }),
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
        public:
          attributes?.[LangfuseOtelSpanAttributes.TRACE_PUBLIC] === true ||
          attributes?.[LangfuseOtelSpanAttributes.TRACE_PUBLIC] === "true" ||
          attributes?.["langfuse.public"] === true ||
          attributes?.["langfuse.public"] === "true",
        tags: this.extractTags(attributes),
        environment: this.extractEnvironment(attributes, resourceAttributes),
        ...this.extractInputAndOutput(span?.events ?? [], attributes, "trace"),
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
      spanAttributesInMetadata,
      scopeSpan,
      scopeAttributes,
      isLangfuseSDKSpans,
      startTimeISO,
      endTimeISO,
    } = params;

    const observation = {
      id: this.parseId(span.spanId?.data ?? span.spanId),
      traceId,
      parentObservationId,
      name: this.extractName(span.name, attributes),
      startTime: startTimeISO,
      endTime: endTimeISO,
      environment: this.extractEnvironment(attributes, resourceAttributes),
      completionStartTime: this.extractCompletionStartTime(attributes),
      metadata: {
        ...resourceAttributeMetadata,
        ...spanAttributeMetadata,
        ...(isLangfuseSDKSpans ? {} : { attributes: spanAttributesInMetadata }),
        resourceAttributes,
        scope: { ...scopeSpan.scope, attributes: scopeAttributes },
      },
      level:
        attributes[LangfuseOtelSpanAttributes.OBSERVATION_LEVEL] ??
        (span.status?.code === 2
          ? ObservationLevel.ERROR
          : ObservationLevel.DEFAULT),
      statusMessage:
        attributes[LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE] ??
        span.status?.message ??
        null,
      version:
        attributes[LangfuseOtelSpanAttributes.VERSION] ??
        resourceAttributes?.["service.version"] ??
        null,
      modelParameters: this.extractModelParameters(attributes) as any,
      model: this.extractModelName(attributes),
      promptName:
        attributes?.[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] ??
        attributes["langfuse.prompt.name"] ??
        null,
      promptVersion:
        attributes?.[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION] ??
        attributes["langfuse.prompt.version"] ??
        null,
      usageDetails: this.extractUsageDetails(
        attributes,
        isLangfuseSDKSpans,
      ) as any,
      costDetails: this.extractCostDetails(
        attributes,
        isLangfuseSDKSpans,
      ) as any,
      ...this.extractInputAndOutput(span?.events ?? [], attributes),
    };

    const isGeneration =
      attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] ===
        "generation" ||
      Boolean(observation.model) ||
      ("openinference.span.kind" in attributes &&
        attributes["openinference.span.kind"] === "LLM");

    const isEvent =
      attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] === "event";

    return {
      id: randomUUID(),
      type: isGeneration
        ? "generation-create"
        : isEvent
          ? "event-create"
          : "span-create",
      timestamp: new Date().toISOString(),
      body: observation,
    } as unknown as IngestionEventType;
  }

  private validatePublicKey(
    isLangfuseSDKSpans: boolean,
    scopeAttributes: Record<string, unknown>,
    resourceAttributes: Record<string, unknown>,
  ): void {
    if (
      isLangfuseSDKSpans &&
      (!this.publicKey ||
        (scopeAttributes["public_key"] as unknown as string) !==
          this.publicKey) &&
      (resourceAttributes["telemetry.sdk.language"] as unknown as string) ===
        "python" // Only Python has multi project setups. Node OTEL does not allow setting scope.attributes, thus skipping the check for node
    ) {
      throw new ForbiddenError(
        `Langfuse OTEL SDK span has different public key '${scopeAttributes["public_key"]}' than used for authentication '${this.publicKey}'. Discarding span.`,
      );
    }
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
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_user_id`,
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_session_id`,
      `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_tags`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_session_id`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_user_id`,
      `${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_tags`,
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

    if (useArray) {
      const result: any[] = [];
      for (const key of keys) {
        const [index, ikey] = key.split(".", 2) as [number, string];
        if (!result[index]) {
          result[index] = {};
        }
        result[index][ikey] = input[`${prefix}.${index}.${ikey}`];
      }
      return result;
    } else {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = input[`${prefix}.${key}`];
      }
      return result;
    }
  }

  private extractInputAndOutput(
    events: any[],
    attributes: Record<string, unknown>,
    domain?: "trace" | "observation",
  ): { input: any; output: any } {
    let input = null;
    let output = null;

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
      return { input, output };
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

      const { input: eventInput } = this.extractInputAndOutput([], input);
      const { output: eventOutput } = this.extractInputAndOutput([], output);
      return { input: eventInput || input, output: eventOutput || output };
    }

    // Google Vertex AI Agent-Developer-Kit (ADK)
    input = attributes["gcp.vertex.agent.llm_request"];
    output = attributes["gcp.vertex.agent.llm_response"];
    if (input || output) {
      return { input, output };
    }

    // Logfire uses `prompt` and `all_messages_events` property on spans
    input = attributes["prompt"];
    output = attributes["all_messages_events"];
    if (input || output) {
      return { input, output };
    }

    // Logfire uses single `events` array for GenAI events
    const eventsArray = attributes["events"];
    if (typeof eventsArray === "string" || Array.isArray(eventsArray)) {
      let events = eventsArray as any[];
      if (typeof eventsArray === "string") {
        try {
          events = JSON.parse(eventsArray);
        } catch (e) {
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
        };
      }
    }

    // MLFlow sets mlflow.spanInputs and mlflow.spanOutputs
    input = attributes["mlflow.spanInputs"];
    output = attributes["mlflow.spanOutputs"];
    if (input || output) {
      return { input, output };
    }

    // TraceLoop sets traceloop.entity.input and traceloop.entity.output
    input = attributes["traceloop.entity.input"];
    output = attributes["traceloop.entity.output"];
    if (input || output) {
      return { input, output };
    }

    // SmolAgents sets input.value and output.value
    input = attributes["input.value"];
    output = attributes["output.value"];
    if (input || output) {
      return { input, output };
    }

    // Pydantic and Pipecat uses input and output
    input = attributes["input"];
    output = attributes["output"];
    if (input || output) {
      return { input, output };
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
      };
    }

    return { input: null, output: null };
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
      if (resourceAttributes[key]) {
        return resourceAttributes[key] as string;
      }
      if (attributes[key]) {
        return attributes[key] as string;
      }
    }

    return "default";
  }

  private extractName(
    spanName: string,
    attributes: Record<string, unknown>,
  ): string {
    const nameKeys = ["logfire.msg"];
    for (const key of nameKeys) {
      if (attributes[key]) {
        return typeof attributes[key] === "string"
          ? (attributes[key] as string)
          : JSON.stringify(attributes[key]);
      }
    }

    return spanName;
  }

  private extractMetadata(
    attributes: Record<string, unknown>,
    domain: "trace" | "observation",
  ): Record<string, unknown> {
    let metadata: Record<string, unknown> = {};

    const metadataKeyPrefix =
      domain === "observation"
        ? LangfuseOtelSpanAttributes.OBSERVATION_METADATA
        : LangfuseOtelSpanAttributes.TRACE_METADATA;

    const langfuseMetadataAttribute =
      attributes[metadataKeyPrefix] || attributes["langfuse.metadata"];

    if (langfuseMetadataAttribute) {
      try {
        if (typeof langfuseMetadataAttribute === "string") {
          metadata = JSON.parse(langfuseMetadataAttribute as string);
        } else if (typeof langfuseMetadataAttribute === "object") {
          metadata = langfuseMetadataAttribute as Record<string, unknown>;
        }
      } catch (e) {
        // Continue with nested metadata extraction
      }
    }

    const langfuseMetadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes)) {
      for (const prefix of [metadataKeyPrefix, "langfuse.metadata"]) {
        if (key.startsWith(`${prefix}.`)) {
          const newKey = key.replace(`${prefix}.`, "");
          langfuseMetadata[newKey] = value;
        }
      }
    }

    return {
      ...metadata,
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
      } catch {}
    }

    if (attributes["llm.invocation_parameters"]) {
      try {
        return this.sanitizeModelParams(
          JSON.parse(attributes["llm.invocation_parameters"] as string),
        );
      } catch (e) {
        // fallthrough
      }
    }

    if (attributes["model_config"]) {
      try {
        return this.sanitizeModelParams(
          JSON.parse(attributes["model_config"] as string),
        );
      } catch (e) {
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
      "gen_ai.request.model",
      "gen_ai.response.model",
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
    isLangfuseSDKSpan: boolean,
  ): Record<string, unknown> {
    if (isLangfuseSDKSpan) {
      try {
        return JSON.parse(
          attributes[
            LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS
          ] as string,
        );
      } catch {}
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
    isLangfuseSDKSpan: boolean,
  ): Record<string, unknown> {
    if (isLangfuseSDKSpan) {
      try {
        return JSON.parse(
          attributes[
            LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS
          ] as string,
        );
      } catch {}
    }

    if (attributes["gen_ai.usage.cost"]) {
      return { total: attributes["gen_ai.usage.cost"] };
    }
    return {};
  }

  private extractCompletionStartTime(attributes: Record<string, unknown>) {
    try {
      return JSON.parse(
        attributes[
          LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME
        ] as string,
      );
    } catch {}

    return null;
  }

  private extractTags(attributes: Record<string, unknown>): string[] {
    const tagsValue =
      attributes[LangfuseOtelSpanAttributes.TRACE_TAGS] ||
      attributes["langfuse.tags"] ||
      attributes[
        `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.langfuse_tags`
      ] ||
      attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.langfuse_tags`];

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
      } catch (e) {
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
          const result = await redis?.call(
            "SET",
            key,
            "1",
            "NX",
            "EX",
            TTLSeconds,
          );

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
    timestamp:
      | number
      | string
      | {
          high: number;
          low: number;
        },
  ): string {
    if (typeof timestamp === "string") {
      return new Date(Number(BigInt(timestamp) / BigInt(1e6))).toISOString();
    }
    if (typeof timestamp === "number") {
      return new Date(timestamp / 1e6).toISOString();
    }

    // Convert high and low to BigInt
    const highBits = BigInt(timestamp.high) << BigInt(32);
    const lowBits = BigInt(timestamp.low >>> 0);

    // Combine high and low bits
    const nanosBigInt = highBits | lowBits;

    // Convert nanoseconds to milliseconds for JavaScript Date
    const millisBigInt = nanosBigInt / BigInt(1000000);
    return new Date(Number(millisBigInt)).toISOString();
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
