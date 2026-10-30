import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "@/src/server/api/root";

// unreachable code check

export { assertUnreachable } from "@langfuse/shared";

// primitive type checks

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;

const isUndefinedOrNull = <T>(val?: T | null): val is undefined | null =>
  val === undefined || val === null;

export const isNotNullOrUndefined = <T>(
  val?: T | null,
): val is Exclude<T, null | undefined> => !isUndefinedOrNull(val);
