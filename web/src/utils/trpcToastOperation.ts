import { MutationCache, type Register } from "@tanstack/react-query";
import type {
  ToastOperation,
  TrpcToastOperation,
} from "@/src/features/notifications/toastAnalytics";
import {
  applicationToastOperations,
  type ApplicationToastOperation,
} from "@/src/features/notifications/toastOperations";

type ToastOperationMeta = {
  /**
   * Static application intent for direct TanStack hooks. It stays optional at
   * the library level because tRPC hooks get an exact path from the link and
   * fully silenced queries never emit a toast. Never use ids, names, URLs, or
   * query input.
   */
  toastOperation?: ApplicationToastOperation;
  [key: string]: unknown;
};

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: ToastOperationMeta;
    mutationMeta: ToastOperationMeta;
  }
}

const trpcToastOperationByError = new WeakMap<object, TrpcToastOperation>();
const applicationToastOperationByError = new WeakMap<
  object,
  ApplicationToastOperation
>();

const isWeakMapKey = (value: unknown): value is object =>
  (typeof value === "object" && value !== null) || typeof value === "function";

/**
 * Associates the typed procedure path from a tRPC operation with its emitted
 * error without mutating or serializing the error.
 */
export const rememberTrpcToastOperation = (
  error: unknown,
  operation: TrpcToastOperation,
): void => {
  if (isWeakMapKey(error)) {
    trpcToastOperationByError.set(error, operation);
  }
};

export const getTrpcToastOperation = (
  error: unknown,
): TrpcToastOperation | undefined =>
  isWeakMapKey(error) ? trpcToastOperationByError.get(error) : undefined;

const isApplicationToastOperation = (
  value: unknown,
): value is ApplicationToastOperation =>
  typeof value === "string" &&
  (applicationToastOperations as readonly string[]).includes(value);

const rememberToastOperationFromMeta = (
  error: unknown,
  meta: Register["mutationMeta"] | undefined,
): void => {
  if (
    isWeakMapKey(error) &&
    isApplicationToastOperation(meta?.toastOperation)
  ) {
    applicationToastOperationByError.set(error, meta.toastOperation);
  }
};

/**
 * React Query exposes mutation metadata to the cache callback before invoking
 * the mutation's default or local error handler. This cache records only the
 * validated static intent; reporting and toast presentation remain owned by
 * the existing handlers.
 */
export const createToastOperationMutationCache = (): MutationCache =>
  new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      rememberToastOperationFromMeta(error, mutation.meta);
    },
  });

/**
 * Resolves bounded analytics context for the global React Query error seam.
 * Exact tRPC paths win; direct TanStack queries can provide a registered static
 * intent in metadata. The caller supplies an explicit gap marker as a last
 * resort. Query and mutation keys are deliberately excluded because they can
 * contain tenant and resource identifiers.
 */
export const resolveToastOperation = (
  error: unknown,
  meta: Register["queryMeta"] | Register["mutationMeta"] | undefined,
  fallback: ToastOperation,
): ToastOperation => {
  const linkedOperation = getTrpcToastOperation(error);
  if (linkedOperation) return linkedOperation;

  const rememberedApplicationOperation = isWeakMapKey(error)
    ? applicationToastOperationByError.get(error)
    : undefined;
  if (rememberedApplicationOperation) return rememberedApplicationOperation;

  return isApplicationToastOperation(meta?.toastOperation)
    ? meta.toastOperation
    : fallback;
};
