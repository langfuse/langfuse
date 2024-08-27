import * as z from "zod";

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
    nestedLiteralSchema,
    z.array(jsonSchemaNullable),
    z.record(jsonSchemaNullable),
  ])
);

// Root schema that does not allow nulls at the root level
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    rootLiteralSchema,
    z.array(jsonSchemaNullable),
    z.record(jsonSchemaNullable),
  ])
);

export const paginationZod = {
  page: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().default(1)
  ),
  limit: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().lte(100).default(50)
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

export const noHtmlRegex = /<[^>]*>/;
export const noHtmlCheck = (value: string) => !noHtmlRegex.test(value);

export const NonEmptyString = z.string().min(1);

/**
 * Validates an object against a Zod schema and helps with IDE type warnings.
 *
 * @param schema - The Zod schema to validate against.
 * @param object - The object to be validated.
 * @returns The parsed object if validation is successful.
 */
export const validateZodSchema = <T extends z.ZodTypeAny>(
  schema: T,
  object: z.infer<T>
): z.infer<T> => {
  return schema.parse(object);
};
