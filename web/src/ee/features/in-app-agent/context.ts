import { filterOperators } from "@langfuse/shared";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { z } from "zod";

const AgUiContextSchema = z.object({
  description: z.string(),
  value: z.string(),
});

const InAppAgentScreenContextInputSchema = z.object({
  currentUrl: z.string().trim().pipe(z.url().max(4096)),
});

const SafeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:.@+-]+$/)
  .refine((id) => !isInstructionLikeId(id));
const ProjectIdSchema = z
  .string()
  .regex(/^[a-z0-9_-]{1,128}$/i)
  .refine((id) => !isInstructionLikeId(id));
const ResourceSchema = z.enum([
  "traces",
  "sessions",
  "datasets",
  "prompts",
  "dashboards",
  "evals",
  "playground",
  "settings",
] as const);
const FilterValueSchema = z
  .string()
  .regex(/^[\w@.+:-]{1,200}$/)
  .refine((value) => isSafeEmailLike(value) || !isInstructionLikeId(value));
const FilterFieldSchema = z.union([
  FilterValueSchema,
  z.literal("score_categories"),
]);
const FilterTypeSchema = z.string().regex(/^[A-Za-z0-9_:-]{1,64}$/);
const FilterOperatorSchema = z.enum([
  ...new Set(Object.values(filterOperators).flat()),
] as [string, ...string[]]);
const SafePathSegmentSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:.@+-]+$/)
  .refine((segment) => !isInstructionLikeId(segment));
const SafeTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
const REDACTED_PATH_SEGMENT = "<redacted>";

// URL-derived fields are optional context: ignore missing or invalid values
// instead of dropping the entire sanitized screen context.
const optionalSanitizedSchema = <T>(schema: z.ZodType<T>) =>
  schema
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined);

const SanitizedScreenContextFilterSchema = z.object({
  field: FilterFieldSchema,
  type: FilterTypeSchema,
  operator: FilterOperatorSchema,
  key: FilterValueSchema.optional(),
  value: z.union([FilterValueSchema, z.number(), z.boolean()]).optional(),
  values: z.array(FilterValueSchema).max(10).optional(),
});

type SafeScreenContextFilter = z.infer<
  typeof SanitizedScreenContextFilterSchema
>;

const SanitizedInAppAgentScreenContextOutputSchema = z.object({
  currentPage: z
    .object({
      path: z.string().max(2048),
      projectId: optionalSanitizedSchema(ProjectIdSchema),
      resource: optionalSanitizedSchema(ResourceSchema),
      traceId: optionalSanitizedSchema(SafeIdSchema),
      observationId: optionalSanitizedSchema(SafeIdSchema),
      peekId: optionalSanitizedSchema(SafeIdSchema),
      timestamp: optionalSanitizedSchema(SafeTimestampSchema),
      filters: z
        .array(SanitizedScreenContextFilterSchema)
        .max(10)
        .transform((filters) => (filters.length > 0 ? filters : undefined)),
    })
    .transform((value) => {
      return Object.fromEntries(
        Object.entries(value).filter(
          ([, fieldValue]) => fieldValue !== undefined,
        ),
      );
    }),
});

type SanitizedValue<T> = [value: T, wasSanitized: boolean];
type SanitizedFilterValue = string | number | boolean | string[] | undefined;

// Security boundary for prompt context: this schema accepts client-controlled
// AG-UI context, rejects untrusted URLs, and emits only bounded, allowlisted
// URL facts. Localhost URLs are accepted only in development. Do not pass raw
// context values into prompts or tracing.
const SanitizedInAppAgentScreenContextSchema = z
  .array(AgUiContextSchema)
  .transform((context, ctx) => {
    const currentUrl = context.find(
      (item) => item.description === "currentUrl",
    )?.value;
    const parsedInput = InAppAgentScreenContextInputSchema.safeParse({
      currentUrl,
    });

    if (!parsedInput.success) {
      ctx.addIssue({
        code: "custom",
        message: "Screen context URL is invalid",
      });
      return z.NEVER;
    }

    const url = new URL(parsedInput.data.currentUrl);

    if (!isAllowedScreenContextUrl(url)) {
      ctx.addIssue({
        code: "custom",
        message: "Screen context URL host is not allowed",
      });
      return z.NEVER;
    }

    const rawPath = url.pathname.slice(0, 2048);
    const pathSegments = rawPath.split("/").filter(Boolean);
    const isProjectRoute = pathSegments[0] === "project";
    const rawProjectId = isProjectRoute ? pathSegments[1] : undefined;
    const rawResource = isProjectRoute ? pathSegments[2] : undefined;
    const parsedResource = ResourceSchema.safeParse(rawResource);
    const projectId = ProjectIdSchema.safeParse(rawProjectId).success
      ? rawProjectId
      : undefined;
    const resource = parsedResource.success ? parsedResource.data : undefined;
    const [path, didSanitizePath] = isProjectRoute
      ? sanitizeProjectPath({ rawPath, projectId, rawProjectId, resource })
      : sanitizeNonProjectPath({ rawPath, pathSegments });
    const [traceId, didSanitizeTraceId] = sanitizeSearchParam(
      url,
      "traceId",
      SafeIdSchema,
    );
    const [observationId, didSanitizeObservationId] = sanitizeSearchParam(
      url,
      "observation",
      SafeIdSchema,
    );
    const [peekId, didSanitizePeekId] = sanitizeSearchParam(
      url,
      "peek",
      SafeIdSchema,
    );
    const [timestamp, didSanitizeTimestamp] = sanitizeSearchParam(
      url,
      "timestamp",
      SafeTimestampSchema,
    );
    const [filters, didSanitizeFilters] = parseSafeFilters(
      url.searchParams.get("filter"),
    );
    const currentPage = {
      path,
      projectId,
      resource,
      traceId,
      observationId,
      peekId,
      timestamp,
      filters,
    };
    const wasSanitized =
      didSanitizePath ||
      didSanitizeTraceId ||
      didSanitizeObservationId ||
      didSanitizePeekId ||
      didSanitizeTimestamp ||
      didSanitizeFilters;

    const parsedContext =
      SanitizedInAppAgentScreenContextOutputSchema.safeParse({ currentPage });

    if (!parsedContext.success) {
      ctx.addIssue({
        code: "custom",
        message: "Screen context URL could not be sanitized",
      });
      return z.NEVER;
    }

    return { context: parsedContext.data, wasSanitized };
  });

export type SanitizedInAppAgentScreenContext = z.infer<
  typeof SanitizedInAppAgentScreenContextOutputSchema
>;

export function sanitizeInAppAgentScreenContext(
  context: z.infer<typeof AgUiContextSchema>[],
): [SanitizedInAppAgentScreenContext | null, boolean] {
  const parsedContext =
    SanitizedInAppAgentScreenContextSchema.safeParse(context);

  if (!parsedContext.success) {
    return [null, false];
  }

  return [parsedContext.data.context, parsedContext.data.wasSanitized];
}

function isAllowedScreenContextUrl(url: URL): boolean {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return (
      process.env.NODE_ENV === "development" &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  }

  return url.protocol === "https:" && url.hostname.endsWith(".langfuse.com");
}

function sanitizeProjectPath(params: {
  rawPath: string;
  projectId?: string;
  rawProjectId?: string;
  resource?: z.infer<typeof ResourceSchema>;
}): SanitizedValue<string> {
  const path = `/${[
    "project",
    params.projectId ??
      (params.rawProjectId ? REDACTED_PATH_SEGMENT : undefined),
    params.resource,
  ]
    .filter(Boolean)
    .join("/")}`;

  return [path, path !== params.rawPath];
}

function sanitizeNonProjectPath(params: {
  rawPath: string;
  pathSegments: string[];
}): SanitizedValue<string> {
  const { rawPath, pathSegments } = params;

  if (pathSegments.length === 0) {
    return ["/", rawPath !== "/"];
  }

  const parsedSegments = pathSegments.map((segment) => ({
    segment,
    isSafe: SafePathSegmentSchema.safeParse(segment).success,
  }));
  const pathLooksInstructionLike =
    parsedSegments.every(({ isSafe }) => isSafe) &&
    isInstructionLikePath(pathSegments);

  const path = `/${parsedSegments
    .map(({ segment, isSafe }) =>
      pathLooksInstructionLike || !isSafe ? REDACTED_PATH_SEGMENT : segment,
    )
    .join("/")}`.slice(0, 2048);

  return [path, path !== rawPath];
}

function sanitizeSearchParam<T>(
  url: URL,
  key: string,
  schema: z.ZodType<T>,
): SanitizedValue<T | undefined> {
  const rawValue = url.searchParams.get(key);

  if (rawValue === null) {
    return [undefined, false];
  }

  const parsedValue = schema.safeParse(rawValue);

  return parsedValue.success ? [parsedValue.data, false] : [undefined, true];
}

function isInstructionLikePath(pathSegments: string[]): boolean {
  const normalizedParts = pathSegments.flatMap(getInstructionLikeParts);

  return normalizedParts.length >= 3 && normalizedParts.join("").length >= 24;
}

function isInstructionLikeId(id: string): boolean {
  // UUIDs and hex-only trace/span IDs are common machine-generated identifiers,
  // so do not treat their length alone as sentence-like prompt text.
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    /^[0-9a-f]{16,64}$/i.test(id) ||
    /^c[a-z0-9]{24}$/i.test(id)
  ) {
    return false;
  }

  // Keep this language-agnostic: instruction-like IDs are detected by
  // sentence-like structure, not by matching specific prompt-injection words.
  const separatedWordParts = getInstructionLikeParts(id);
  const separatedAlphaCharCount = separatedWordParts.join("").length;
  const camelWordParts = getInstructionLikeParts(
    id.replace(/([a-z])([A-Z])/g, "$1 $2"),
  );
  const camelAlphaCharCount = camelWordParts.join("").length;
  const normalizedIdAlphaLength = normalizeInstructionLikePart(id).length;
  const isObfuscatedOrCompact =
    /[^A-Za-z0-9]/.test(id) || /[013457]/.test(id) || /^[a-z]+$/i.test(id);

  return (
    (separatedWordParts.length >= 2 && separatedAlphaCharCount >= 12) ||
    (camelWordParts.length >= 3 && camelAlphaCharCount >= 20) ||
    (isObfuscatedOrCompact && normalizedIdAlphaLength >= 20)
  );
}

function getInstructionLikeParts(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map(normalizeInstructionLikePart)
    .filter((part) => /^[a-z]{3,}$/i.test(part));
}

function normalizeInstructionLikePart(part: string): string {
  if (/^\d+$/.test(part)) {
    return "";
  }

  return part
    .toLowerCase()
    .replaceAll("0", "o")
    .replaceAll("1", "i")
    .replaceAll("3", "e")
    .replaceAll("4", "a")
    .replaceAll("5", "s")
    .replaceAll("7", "t")
    .replace(/[^a-z]/g, "");
}

function isSafeEmailLike(value: string): boolean {
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
    return false;
  }

  const [localPart, domainPart] = value.split("@");

  if (!localPart || !domainPart) {
    return false;
  }

  const hasLeetspeakObfuscation = /[013457]/.test(value);

  return (
    (!hasLeetspeakObfuscation ||
      !isInstructionLikeId(value.replace("@", "."))) &&
    !isInstructionLikeId(localPart) &&
    !isInstructionLikeId(domainPart)
  );
}

function parseSafeFilters(
  filter: string | null,
): SanitizedValue<SafeScreenContextFilter[]> {
  if (!filter) {
    return [[], false];
  }

  let wasSanitized = false;
  const sanitizedFilters = decodeFiltersGeneric(
    normalizeLegacyFilterKeySlots(filter),
  ).flatMap((decodedFilter) => {
    const [filters, didSanitizeFilter] = sanitizeFilter(decodedFilter);
    wasSanitized ||= didSanitizeFilter;
    return filters;
  });

  return [
    sanitizedFilters.slice(0, 10),
    wasSanitized || sanitizedFilters.length > 10,
  ];
}

function normalizeLegacyFilterKeySlots(filter: string) {
  return filter
    .split(",")
    .map((rawFilter) => {
      const parts = rawFilter.split(";");

      return parts.length === 4
        ? [parts[0], parts[1], "", parts[2], parts[3]].join(";")
        : rawFilter;
    })
    .join(",");
}

function sanitizeFilter(
  filter: ReturnType<typeof decodeFiltersGeneric>[number],
): SanitizedValue<SafeScreenContextFilter[]> {
  const [sanitizedValue, didSanitizeValue] = sanitizeFilterValue(filter.value);

  if (
    sanitizedValue === undefined &&
    filter.type !== "null" &&
    filter.type !== "positionInTrace"
  ) {
    return [[], true];
  }

  const sanitizedFilter = SanitizedScreenContextFilterSchema.safeParse({
    field: filter.column,
    type: filter.type,
    operator: filter.operator,
    ...("key" in filter ? { key: filter.key } : {}),
    ...(sanitizedValue === undefined
      ? {}
      : Array.isArray(sanitizedValue)
        ? { values: sanitizedValue }
        : { value: sanitizedValue }),
  });

  return sanitizedFilter.success
    ? [[sanitizedFilter.data], didSanitizeValue]
    : [[], true];
}

function sanitizeFilterValue(
  value: unknown,
): SanitizedValue<SanitizedFilterValue> {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? [undefined, true]
      : [value.toISOString(), false];
  }

  if (typeof value === "string") {
    return FilterValueSchema.safeParse(value).success
      ? [value, false]
      : [undefined, true];
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? [value, false] : [undefined, true];
  }

  if (typeof value === "boolean") {
    return [value, false];
  }

  if (Array.isArray(value)) {
    const values = value.flatMap((item) =>
      typeof item === "string" && FilterValueSchema.safeParse(item).success
        ? [item]
        : [],
    );

    return values.length > 0
      ? [
          values.slice(0, 10),
          values.length !== value.length || values.length > 10,
        ]
      : [undefined, true];
  }

  return [undefined, true];
}
