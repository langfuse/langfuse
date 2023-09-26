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

export const paginationZod = {
  page: z
    .number()
    .int()
    .positive()
    .default(1)
    .nullish()
    .transform((value, ctx): number => {
      if (value == null) {
        ctx.addIssue({
          code: "invalid_type",
          expected: "number",
          received: "null",
        });
        return z.NEVER;
      }
      return value;
    }),
  limit: z
    .number()
    .int()
    .positive()
    .lte(100)
    .default(50)
    .nullish()
    .transform((value, ctx): number => {
      if (value == null) {
        ctx.addIssue({
          code: "invalid_type",
          expected: "number",
          received: "null",
        });
        return z.NEVER;
      }
      return value;
    }),
};

export const pageZod = z
  .number()
  .int()
  .positive()
  .default(1)
  .nullish()
  .transform((value, ctx): number => {
    if (value == null) {
      ctx.addIssue({
        code: "invalid_type",
        expected: "number",
        received: "null",
      });
      return z.NEVER;
    }
    return value;
  });
