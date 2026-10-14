import { z } from "zod";

// Audit events are written to the Postgres `audit_log_staging` table and from
// there into the ClickHouse `audit_logs` table. A `change` event records a
// mutation with its before/after state. An `access` event records a read: the
// request params, the number of returned rows, and typed refs to the
// resources that were opened or returned.

/** Upper bound for the serialized `params` of an access event, in UTF-8 bytes. */
export const AUDIT_LOG_PARAMS_MAX_BYTES = 2048;

/** Upper bound for `outcomeReason` and the User-Agent, in UTF-8 bytes. */
export const AUDIT_LOG_TEXT_MAX_BYTES = 512;

/**
 * Upper bound for `resourceRefs` on one event: twice the largest list page
 * (1000 rows on GET /api/public/v2/observations), so a list can carry an
 * observation ref and a trace ref for every row it returned.
 */
export const AUDIT_LOG_RESOURCE_REFS_MAX = 2000;

/** Ends a value that was cut to its byte limit. Cut `params` are no longer valid JSON. */
export const AUDIT_LOG_TRUNCATION_MARKER = "...[truncated]";

const AUDIT_LOG_RESOURCE_REF_TYPES = [
  "trace",
  "observation",
  "score",
  "session",
] as const;
export type AuditLogResourceRefType =
  (typeof AUDIT_LOG_RESOURCE_REF_TYPES)[number];

// The type prefix keeps user-supplied ids of different resource types apart.
const AuditLogResourceRefSchema = z.templateLiteral([
  z.enum(AUDIT_LOG_RESOURCE_REF_TYPES),
  ":",
  z.string().min(1),
]);
export type AuditLogResourceRef = z.infer<typeof AuditLogResourceRefSchema>;

export const toAuditLogResourceRef = (
  type: AuditLogResourceRefType,
  id: string,
): AuditLogResourceRef => `${type}:${id}`;

const AuditLogActorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("USER"),
    userId: z.string().min(1),
    // Name and email as of the event, so removed members stay identifiable.
    name: z.string().optional(),
    email: z.string().optional(),
    orgRole: z.string().optional(),
    projectRole: z.string().optional(),
  }),
  z.object({
    type: z.literal("API_KEY"),
    apiKeyId: z.string().min(1),
    // Set when the key acts on behalf of a user, e.g. an in-app agent key.
    userId: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
  }),
  z.object({
    type: z.literal("SYSTEM"),
    // The acting component, e.g. "stripe-webhook".
    name: z.string().min(1),
  }),
]);
export type AuditLogActor = z.infer<typeof AuditLogActorSchema>;

const AuditRequestContextSchema = z.object({
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  requestId: z.string().optional(),
});
export type AuditRequestContext = z.infer<typeof AuditRequestContextSchema>;

const AuditLogOutcomeSchema = z.enum(["success", "denied", "error"]);

// Bounded by the UInt32 `result_count` column in ClickHouse.
const ResultCountSchema = z.number().int().nonnegative().max(4_294_967_295);

const StagedEventBaseSchema = z.object({
  orgId: z.string().min(1),
  // Absent for organisation-level events.
  projectId: z.string().optional(),
  actor: AuditLogActorSchema,
  resourceType: z.string().min(1),
  // Absent for lists, which identify their rows through `resourceRefs`.
  resourceId: z.string().optional(),
  resourceRefs: z.array(AuditLogResourceRefSchema),
  action: z.string().min(1),
  outcome: AuditLogOutcomeSchema,
  outcomeReason: z.string().optional(),
  surface: z.enum(["trpc", "public-api", "mcp"]).optional(),
  route: z.string().optional(),
  request: AuditRequestContextSchema.optional(),
});

/** The `payload` of an `audit_log_staging` row. */
export const AuditLogStagingPayloadSchema = z.discriminatedUnion("kind", [
  StagedEventBaseSchema.extend({
    kind: z.literal("change"),
    // Serialized JSON.
    before: z.string().optional(),
    after: z.string().optional(),
  }),
  StagedEventBaseSchema.extend({
    kind: z.literal("access"),
    // Serialized JSON of the validated request input, at most
    // AUDIT_LOG_PARAMS_MAX_BYTES.
    params: z.string().optional(),
    resultCount: ResultCountSchema.optional(),
  }),
]);
export type AuditLogStagingPayload = z.infer<
  typeof AuditLogStagingPayloadSchema
>;

const utf8ByteLength = (char: string): number => {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

const MARKER_BYTES = Array.from(AUDIT_LOG_TRUNCATION_MARKER).reduce(
  (sum, char) => sum + utf8ByteLength(char),
  0,
);

// Cuts on a code point boundary, so the result never holds a lone surrogate,
// which Postgres rejects in jsonb.
const truncateUtf8 = (value: string, maxBytes: number): string => {
  let bytes = 0;
  let index = 0;
  let cutAt: number | undefined;
  for (const char of value) {
    bytes += utf8ByteLength(char);
    if (cutAt === undefined && bytes > maxBytes - MARKER_BYTES) cutAt = index;
    if (bytes > maxBytes) {
      return value.slice(0, cutAt) + AUDIT_LOG_TRUNCATION_MARKER;
    }
    index += char.length;
  }
  return value;
};

const cappedText = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : truncateUtf8(value, AUDIT_LOG_TEXT_MAX_BYTES),
  );

const serializedJson = z
  .unknown()
  .optional()
  .transform((value) =>
    value === undefined || value === null ? undefined : JSON.stringify(value),
  );

// Postgres jsonb cannot store NUL or an unpaired surrogate. Both become U+FFFD,
// so an event whose ids carry one still stages instead of failing the request.
// `before`, `after` and `params` are already escaped by JSON.stringify.
const toJsonbSafeStrings = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replaceAll("\u0000", "\uFFFD").toWellFormed();
  }
  if (Array.isArray(value)) return value.map(toJsonbSafeStrings);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        toJsonbSafeStrings(entry),
      ]),
    );
  }
  return value;
};

const EventBaseSchema = StagedEventBaseSchema.extend({
  resourceRefs: z
    .array(AuditLogResourceRefSchema)
    .default([])
    .transform((refs) =>
      Array.from(new Set(refs)).slice(0, AUDIT_LOG_RESOURCE_REFS_MAX),
    ),
  outcome: AuditLogOutcomeSchema.default("success"),
  outcomeReason: cappedText,
  request: AuditRequestContextSchema.extend({
    userAgent: cappedText,
  }).optional(),
});

/**
 * An audit event as callers record it. Parsing serializes `before`, `after`
 * and `params` to JSON, applies the size caps above and makes every string
 * storable in jsonb, which yields an `AuditLogStagingPayload`.
 */
export const AuditLogEventSchema = z
  .discriminatedUnion("kind", [
    EventBaseSchema.extend({
      kind: z.literal("change"),
      before: serializedJson,
      after: serializedJson,
    }),
    EventBaseSchema.extend({
      kind: z.literal("access"),
      params: serializedJson.transform((json) =>
        json === undefined
          ? undefined
          : truncateUtf8(json, AUDIT_LOG_PARAMS_MAX_BYTES),
      ),
      resultCount: ResultCountSchema.optional(),
    }),
  ])
  .transform((event) => toJsonbSafeStrings(event) as typeof event);
export type AuditLogEvent = z.input<typeof AuditLogEventSchema>;
