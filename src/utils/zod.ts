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

type JsonNested = Literal | { [key: string]: JsonNested } | JsonNested[];
type Json = Root | { [key: string]: JsonNested } | JsonNested[];

// Here, you define the schema recursively
const jsonSchemaNullable: z.ZodType<JsonNested> = z.lazy(() =>
  z.union([
    nestedLiteralSchema,
    z.array(jsonSchemaNullable),
    z.record(jsonSchemaNullable),
  ]),
);

// Root schema that does not allow nulls at the root level
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    rootLiteralSchema,
    z.array(jsonSchemaNullable),
    z.record(jsonSchemaNullable),
  ]),
);

export const zodInputStringPipe = (zodPipe: z.ZodTypeAny) =>
  z
    .string()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine((value) => value === null || !isNaN(Number(value)), {
      message: "Invalid Number",
    })
    .transform((value) => (value === null ? undefined : Number(value)))
    .pipe(zodPipe);

export const paginationZod = {
  page: zodInputStringPipe(z.number().default(1)),
  limit: zodInputStringPipe(z.number().lte(100).default(50)),
};
