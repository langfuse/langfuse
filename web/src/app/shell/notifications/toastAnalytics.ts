import type { AnyTRPCProcedure } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import type { AppRouter } from "@/src/server/api/root";
import type { ApplicationToastOperation } from "./toastOperations";

type ProcedurePaths<T> = {
  [K in keyof T & string]: T[K] extends AnyTRPCProcedure
    ? K
    : `${K}.${ProcedurePaths<T[K]>}`;
}[keyof T & string];

export type TrpcToastOperation = ProcedurePaths<AppRouter["_def"]["record"]>;
export type ToastOperation = ApplicationToastOperation | TrpcToastOperation;

type ToastSource = "application" | "trpc";

type ToastErrorOrigin = "frontend" | "backend" | "network";

type ToastErrorCategory =
  | "user_input"
  | "permission"
  | "product_state"
  | "rate_limit"
  | "resource_limit"
  | "transient"
  | "internal";

export type ToastErrorAnalytics = {
  errorOrigin: ToastErrorOrigin;
  errorCategory: ToastErrorCategory;
  operation: ToastOperation;
  trpcCode?: TRPC_ERROR_CODE_KEY;
  httpStatus?: number;
  errorId?: string;
  trpcPath?: TrpcToastOperation;
};

export type ToastErrorEventProperties = Omit<
  ToastErrorAnalytics,
  "trpcPath"
> & {
  toastType: "WARNING" | "ERROR";
  source: ToastSource;
  path?: TrpcToastOperation;
  hasErrorId: boolean;
  isOperationFallback: boolean;
  errorId?: string;
};

type ToastNonErrorEventProperties = {
  toastType: "SUCCESS" | "INFO" | "LOADING" | "MESSAGE" | "CUSTOM";
  source: "application";
  operation: ToastOperation;
  hasErrorId: false;
};

export type ToastShownEventProperties =
  | ToastErrorEventProperties
  | ToastNonErrorEventProperties;

export type ToastInteractionEventProperties =
  | Omit<ToastErrorEventProperties, "hasErrorId" | "errorId">
  | Omit<ToastNonErrorEventProperties, "hasErrorId">;

/** Build from an allowlist: UI content and arbitrary caller fields never reach analytics. */
export const getToastErrorProperties = (
  analytics: ToastErrorAnalytics,
  type: "WARNING" | "ERROR",
  source: ToastSource = "application",
  path = analytics.trpcPath,
  errorId = analytics.errorId,
): ToastErrorEventProperties => ({
  toastType: type,
  source,
  operation: analytics.operation,
  errorOrigin: analytics.errorOrigin,
  errorCategory: analytics.errorCategory,
  ...(path ? { path } : {}),
  ...(analytics.trpcCode ? { trpcCode: analytics.trpcCode } : {}),
  ...(analytics.httpStatus !== undefined
    ? { httpStatus: analytics.httpStatus }
    : {}),
  hasErrorId: Boolean(errorId),
  isOperationFallback:
    analytics.operation === "query.execute" ||
    analytics.operation === "mutation.execute",
  ...(errorId ? { errorId } : {}),
});
