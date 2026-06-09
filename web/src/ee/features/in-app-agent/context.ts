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
const FilterOperatorSchema = z.enum(["any of", "="]);
const SafePathSegmentSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:.@+-]+$/)
  .refine((segment) => !isInstructionLikeId(segment));
const SafeFilterPartsSchema = z.object({
  field: FilterValueSchema,
  type: z.enum(["stringOptions", "boolean"]),
  operator: FilterOperatorSchema,
});
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

const SanitizedScreenContextFilterSchema = z.union([
  z.object({
    field: FilterValueSchema,
    type: z.literal("boolean"),
    operator: FilterOperatorSchema,
    value: z.boolean(),
  }),
  z.object({
    field: FilterValueSchema,
    type: z.literal("stringOptions"),
    operator: FilterOperatorSchema,
    values: z.array(FilterValueSchema).max(10),
  }),
]);

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

// Security boundary for prompt context: this schema accepts client-controlled
// AG-UI context, rejects untrusted URLs, and emits only bounded, allowlisted
// URL facts. Localhost URLs are accepted only in development. Do not pass raw
// context values into prompts or tracing.
export const SanitizedInAppAgentScreenContextSchema = z
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
    const projectId = ProjectIdSchema.safeParse(rawProjectId).success
      ? rawProjectId
      : undefined;
    const resource = ResourceSchema.safeParse(rawResource).success
      ? rawResource
      : undefined;
    const path = isProjectRoute
      ? sanitizeProjectPath({ projectId, rawProjectId, resource })
      : sanitizeNonProjectPath(pathSegments);
    const currentPage = {
      path,
      projectId,
      resource,
      traceId: url.searchParams.get("traceId"),
      observationId: url.searchParams.get("observation"),
      peekId: url.searchParams.get("peek"),
      timestamp: url.searchParams.get("timestamp"),
      filters: parseSafeFilters(url.searchParams.get("filter")),
    };

    const parsedContext =
      SanitizedInAppAgentScreenContextOutputSchema.safeParse({ currentPage });

    if (!parsedContext.success) {
      ctx.addIssue({
        code: "custom",
        message: "Screen context URL could not be sanitized",
      });
      return z.NEVER;
    }

    return parsedContext.data;
  });

export type SanitizedInAppAgentScreenContext = z.infer<
  typeof SanitizedInAppAgentScreenContextSchema
>;

export function sanitizeInAppAgentScreenContext(
  context: z.infer<typeof AgUiContextSchema>[],
): SanitizedInAppAgentScreenContext | null {
  const parsedContext =
    SanitizedInAppAgentScreenContextSchema.safeParse(context);

  return parsedContext.success ? parsedContext.data : null;
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
  projectId?: string;
  rawProjectId?: string;
  resource?: z.infer<typeof ResourceSchema>;
}) {
  return `/${[
    "project",
    params.projectId ??
      (params.rawProjectId ? REDACTED_PATH_SEGMENT : undefined),
    params.resource,
  ]
    .filter(Boolean)
    .join("/")}`;
}

function sanitizeNonProjectPath(pathSegments: string[]) {
  if (pathSegments.length === 0) {
    return "/";
  }

  const parsedSegments = pathSegments.map((segment) => ({
    segment,
    isSafe: SafePathSegmentSchema.safeParse(segment).success,
  }));
  const pathLooksInstructionLike =
    parsedSegments.every(({ isSafe }) => isSafe) &&
    isInstructionLikePath(pathSegments);

  return `/${parsedSegments
    .map(({ segment, isSafe }) =>
      pathLooksInstructionLike || !isSafe ? REDACTED_PATH_SEGMENT : segment,
    )
    .join("/")}`.slice(0, 2048);
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

function parseSafeFilters(filter: string | null) {
  if (!filter) {
    return [];
  }

  return filter
    .split(",")
    .flatMap((rawFilter) => parseSafeFilter(rawFilter))
    .slice(0, 10);
}

function parseSafeFilter(rawFilter: string): SafeScreenContextFilter[] {
  const [
    field,
    type,
    maybeOperator,
    maybeRawValue,
    maybeRawValueWithEmptySlot,
  ] = rawFilter.split(";");
  const operator = maybeRawValueWithEmptySlot ? maybeRawValue : maybeOperator;
  const rawValue = maybeRawValueWithEmptySlot ?? maybeRawValue;

  if (!field || !type || !operator || rawValue === undefined) {
    return [];
  }

  const parsedFilterParts = SafeFilterPartsSchema.safeParse({
    field,
    type,
    operator,
  });

  if (!parsedFilterParts.success) {
    return [];
  }

  if (parsedFilterParts.data.type === "boolean") {
    if (rawValue !== "true" && rawValue !== "false") {
      return [];
    }

    return [
      {
        field: parsedFilterParts.data.field,
        type: parsedFilterParts.data.type,
        operator: parsedFilterParts.data.operator,
        value: rawValue === "true",
      },
    ];
  }

  const values = rawValue
    .split("|")
    .flatMap((value) => {
      const decodedValue = safelyDecodeUriComponent(value);

      return decodedValue && FilterValueSchema.safeParse(decodedValue).success
        ? [decodedValue]
        : [];
    })
    .slice(0, 10);

  return values.length > 0
    ? [
        {
          field: parsedFilterParts.data.field,
          type: parsedFilterParts.data.type,
          operator: parsedFilterParts.data.operator,
          values,
        },
      ]
    : [];
}

function safelyDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
