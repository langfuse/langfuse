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
    z.coerce.number().default(1),
  ),
  limit: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().lte(100).default(50),
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

const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/i;
export const noUrlCheck = (value: string) => !urlRegex.test(value);

export const NonEmptyString = z.string().min(1);

export const htmlRegex = /<[^>]*>/;

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
