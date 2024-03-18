import { z } from "zod";
export declare const orderBy: z.ZodNullable<z.ZodObject<{
    column: z.ZodString;
    order: z.ZodEnum<["ASC", "DESC"]>;
}, "strip", z.ZodTypeAny, {
    column: string;
    order: "ASC" | "DESC";
}, {
    column: string;
    order: "ASC" | "DESC";
}>>;
