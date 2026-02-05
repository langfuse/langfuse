import { InputJsonValue } from "@prisma/client/runtime/library";
import { z } from "zod/v4";

// to be used for Prisma JSON type
// @see: https://github.com/colinhacks/zod#json-type

// For root-level literals where null is not allowed
const rootLiteralSchema = z.union([z.string(), z.number(), z.boolean()]);

// For nested literals where null is allowed
const nestedLiteralSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

type Root = z.infer<typeof rootLiteralSchema>;
type Literal = z.infer<typeof nestedLiteralSchema>;

export type JsonNested = Literal | { [key: string]: JsonNested } | JsonNested[];
type Json = Root | { [key: string]: JsonNested } | JsonNested[];

// Here, you define the schema recursively
export const jsonSchemaNullable: z.ZodType<JsonNested> = z.lazy(() =>
  z.union([
    z.array(jsonSchemaNullable),
    z.record(z.string(), jsonSchemaNullable),
    nestedLiteralSchema,
  ]),
);

// Root schema that does not allow nulls at the root level
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.array(jsonSchemaNullable),
    z.record(z.string(), jsonSchemaNullable),
    rootLiteralSchema,
  ]),
);

export const paginationZod = {
  page: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().nonnegative().default(1),
  ),
  limit: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().nonnegative().lte(100).default(50),
  ),
};

export const publicApiPaginationZod = {
  page: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().gt(0).default(1),
  ),
  limit: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().lte(100).default(50),
  ),
};

export const optionalPaginationZod = {
  page: z
    .preprocess((x) => (x === "" ? undefined : x), z.coerce.number())
    .optional(),
  limit: z
    .preprocess((x) => (x === "" ? undefined : x), z.coerce.number())
    .optional(),
};

export const queryStringZod = z
  .string()
  .transform((val) => decodeURIComponent(val));

export const paginationMetaResponseZod = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/i;
export const noUrlCheck = (value: string) => !urlRegex.test(value);

export const NonEmptyString = z.string().min(1);

export const htmlRegex = /<[^>]*>/g;

export const StringNoHTML = z.string().refine((val) => !htmlRegex.test(val), {
  message: "Text cannot contain HTML tags",
});

export const StringNoHTMLNonEmpty = z
  .string()
  .min(1, "Text cannot be empty")
  .refine((val) => !htmlRegex.test(val), {
    message: "Text cannot contain HTML tags",
  });

/**
 * Validates an object against a Zod schema and helps with IDE type warnings.
 *
 * @param schema - The Zod schema to validate against.
 * @param object - The object to be validated.
 * @returns The parsed object if validation is successful.
 */
export const validateZodSchema = <T extends z.ZodTypeAny>(
  schema: T,
  object: z.infer<T>,
): z.infer<T> => {
  return schema.parse(object);
};

// JSON Schema validation
export const JSONPrimitiveValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]);

export const JSONValueSchema: z.ZodType<InputJsonValue> = z.lazy(() =>
  z.union([
    JSONPrimitiveValueSchema,
    z.array(JSONValueSchema),
    z.record(z.string(), JSONValueSchema),
  ]),
);

export const JSONObjectSchema = z.record(z.string(), JSONValueSchema);
export const JSONArraySchema = z.array(JSONValueSchema);

export type JSONPrimitiveValue = z.infer<typeof JSONPrimitiveValueSchema>;
export type JSONValue = z.infer<typeof JSONValueSchema>;
export type JSONObject = z.infer<typeof JSONObjectSchema>;
export type JSONArray = z.infer<typeof JSONArraySchema>;

/**
 * Sanitizes a string for safe use in email subject lines.
 * Prevents email header injection attacks by removing:
 * - Newline characters (\r, \n) which can be used for CRLF injection
 * - Control characters (ASCII 0-31 and 127) which can cause parsing issues
 * - HTML tags (defensive, though nodemailer should handle this)
 *
 * This is critical for security compliance as it prevents attackers from:
 * - Injecting additional email headers (BCC, CC, From, etc.)
 * - Manipulating email routing
 * - Executing XSS in email clients
 *
 * @param input - The string to sanitize (e.g., user name, project name)
 * @returns Sanitized string safe for email subject lines
 *
 * @example
 * sanitizeEmailSubject("John\r\nBCC: attacker@evil.com") // Returns "JohnBCC: attacker@evil.com"
 * sanitizeEmailSubject("Test<script>alert(1)</script>") // Returns "Testscriptalert(1)/script"
 */
export function sanitizeEmailSubject(input: string): string {
  return (
    input
      // Remove carriage return and line feed (CRLF injection prevention)
      .replace(/[\r\n]/g, "")
      // Remove all control characters (ASCII 0-31 and 127)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, "")
      // Remove HTML tags (defensive layer)
      .replace(htmlRegex, "")
      // Trim whitespace
      .trim()
  );
}

/**
 * Zod schema for optional ISO 8601 timestamp strings (RFC 3339, Section 5.6) in UTC.
 * Used for dataset versioning to allow querying data at a specific point in time.
 *
 * Behavior:
 * - If provided, must be a valid ISO 8601 string (e.g., "2026-01-21T14:35:42Z")
 * - Coerces to Date object
 * - If undefined, treated as optional (returns latest version)
 *
 * @example
 * // Valid inputs
 * versionZod.parse("2026-01-21T14:35:42Z") // Returns Date object
 * versionZod.parse(undefined) // Returns undefined
 */
export const versionZod = z.coerce.date().optional();
