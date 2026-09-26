import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { EventRecordInsertType } from "@langfuse/shared/src/server";
import type { EventInput } from "../../services/IngestionService/index.js";

// Read the existing trace captures and exercise production createEventRecord/writeEventRecord.
// Model lookup responses are replayed from captures; no fixture JSON is copied into Rust.
type JsonObject = Record<string, unknown>;
const repoRoot = resolve(__dirname, "../../../..");

const parseObject = (value: unknown): JsonObject => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parseObject(parsed);
    } catch {
      return {};
    }
  }
  return {};
};

const numberMap = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(parseObject(value)).flatMap(([key, item]) => {
      const number = typeof item === "number" ? item : Number(item);
      return Number.isFinite(number) ? [[key, number]] : [];
    }),
  );

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const stringMap = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    Object.entries(parseObject(value)).map(([key, item]) => [
      key,
      typeof item === "string" ? item : JSON.stringify(item),
    ]),
  );

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const mergeObjects = (...values: unknown[]): JsonObject =>
  Object.assign({}, ...values.map(parseObject));

const fixtureDirectories = [
  resolve(repoRoot, "packages/shared/scripts/seeder/utils/framework-traces"),
  resolve(repoRoot, "worker/src/__tests__/chatml/framework-traces"),
];

const fixturePaths = fixtureDirectories
  .flatMap((directory) =>
    readdirSync(directory)
      .filter((name) =>
        directory.endsWith("chatml/framework-traces")
          ? name.endsWith(".trace.json")
          : name.endsWith(".json"),
      )
      .map((name) => resolve(directory, name)),
  )
  .sort();

const eventInputFromCapture = (
  observation: JsonObject,
  trace: JsonObject,
): EventInput => {
  const isRoot = observation.parentObservationId == null;
  const usageDetails = numberMap(observation.usageDetails);
  const costDetails = numberMap(observation.costDetails);
  const providedUsageDetails = numberMap(observation.providedUsageDetails);
  const providedCostDetails = numberMap(observation.providedCostDetails);

  return {
    projectId: String(observation.projectId ?? trace.projectId ?? "fixture"),
    traceId: String(observation.traceId ?? trace.id),
    spanId: String(observation.id),
    parentSpanId:
      typeof observation.parentObservationId === "string"
        ? observation.parentObservationId
        : undefined,
    startTimeISO: String(observation.startTime),
    endTimeISO: String(observation.endTime ?? observation.startTime),
    completionStartTime: optionalString(observation.completionStartTime),
    name: typeof observation.name === "string" ? observation.name : "",
    type: typeof observation.type === "string" ? observation.type : "SPAN",
    environment: String(
      observation.environment ?? trace.environment ?? "default",
    ),
    version:
      typeof observation.version === "string" ? observation.version : undefined,
    release: typeof trace.release === "string" ? trace.release : undefined,
    traceName: typeof trace.name === "string" ? trace.name : undefined,
    tags: Array.isArray(trace.tags)
      ? trace.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    public: trace.public === true,
    bookmarked: isRoot && trace.bookmarked === true,
    userId: typeof trace.userId === "string" ? trace.userId : undefined,
    sessionId:
      typeof trace.sessionId === "string" ? trace.sessionId : undefined,
    level:
      typeof observation.level === "string" ? observation.level : undefined,
    statusMessage:
      typeof observation.statusMessage === "string"
        ? observation.statusMessage
        : undefined,
    modelName:
      typeof observation.model === "string" ? observation.model : undefined,
    modelId: optionalString(observation.internalModelId),
    modelParameters:
      observation.modelParameters as EventInput["modelParameters"],
    providedUsageDetails:
      Object.keys(providedUsageDetails).length > 0
        ? providedUsageDetails
        : usageDetails,
    usageDetails,
    providedCostDetails:
      Object.keys(providedCostDetails).length > 0
        ? providedCostDetails
        : costDetails,
    costDetails,
    usagePricingTierId: optionalString(observation.usagePricingTierId),
    usagePricingTierName: optionalString(observation.usagePricingTierName),
    promptId: optionalString(observation.promptId),
    promptName: optionalString(observation.promptName),
    promptVersion:
      observation.promptVersion == null
        ? undefined
        : String(observation.promptVersion),
    toolDefinitions: stringMap(observation.toolDefinitions),
    toolCalls: stringArray(observation.toolCalls),
    toolCallNames: stringArray(observation.toolCallNames),
    input: observation.input as string | undefined,
    output: observation.output as string | undefined,
    metadata: mergeObjects(trace.metadata, observation.metadata),
    source: "API",
    ingestionApiKey: "",
    ingestionSdkName: "",
    ingestionSdkVersion: "",
    blobStorageFilePath: "fixtures",
    eventBytes: 0,
  };
};

export const capturedPreparedRows = async () => {
  const { IngestionService } =
    await import("../../services/IngestionService/index.js");

  const normalizedRows: EventRecordInsertType[] = [];
  const capturedGenerationUsage = new Map<
    string,
    Pick<
      EventRecordInsertType,
      | "model_id"
      | "usage_pricing_tier_id"
      | "usage_pricing_tier_name"
      | "usage_details"
      | "cost_details"
    >
  >();
  const writer = {
    addToQueue: (_table: unknown, record: EventRecordInsertType) => {
      normalizedRows.push(record);
    },
  };
  const service = new IngestionService(
    {} as never,
    {} as never,
    writer as never,
    {} as never,
  );

  // Avoid external model and prompt lookups while retaining the production method's field mapping.
  // Captured generation enrichment is replayed where the source trace already contains it.
  (service as any).getGenerationUsage = async ({
    observationRecord,
  }: {
    observationRecord: EventRecordInsertType;
  }) => ({
    usage_details: capturedGenerationUsage.get(observationRecord.id)
      ?.usage_details,
    cost_details: capturedGenerationUsage.get(observationRecord.id)
      ?.cost_details,
    internal_model_id: capturedGenerationUsage.get(observationRecord.id)
      ?.model_id,
    usage_pricing_tier_id: capturedGenerationUsage.get(observationRecord.id)
      ?.usage_pricing_tier_id,
    usage_pricing_tier_name: capturedGenerationUsage.get(observationRecord.id)
      ?.usage_pricing_tier_name,
  });

  for (const fixturePath of fixturePaths) {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      trace?: JsonObject;
      observations?: JsonObject[];
    };
    const trace = fixture.trace ?? {};
    for (const observation of fixture.observations ?? []) {
      const eventInput = eventInputFromCapture(observation, trace);
      capturedGenerationUsage.set(eventInput.spanId, {
        usage_details: eventInput.usageDetails ?? {},
        cost_details: eventInput.costDetails ?? {},
        model_id: eventInput.modelId,
        usage_pricing_tier_id: eventInput.usagePricingTierId,
        usage_pricing_tier_name: eventInput.usagePricingTierName,
      });
      const eventRecord = await service.createEventRecord(
        eventInput,
        `fixtures/${fixturePath.split("/").pop()}`,
      );
      await service.writeEventRecord(eventRecord);
    }
  }

  return normalizedRows;
};
