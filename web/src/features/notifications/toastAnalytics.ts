type ToastSource = "application" | "trpc";

type ToastErrorOrigin = "frontend" | "backend" | "network" | "unknown";

type ToastErrorCategory =
  | "user_input"
  | "permission"
  | "product_state"
  | "rate_limit"
  | "resource_limit"
  | "transient"
  | "internal"
  | "unknown";

export type ToastErrorAnalytics = {
  errorOrigin: ToastErrorOrigin;
  errorCategory: ToastErrorCategory;
  operation?: string;
  trpcCode?: string;
  httpStatus?: number;
};

export type ToastErrorEventProperties = ToastErrorAnalytics & {
  toastType: "WARNING" | "ERROR";
  source: ToastSource;
  path?: string;
  hasErrorId: boolean;
  errorId?: string;
};

type ToastSuccessEventProperties = {
  toastType: "SUCCESS";
  source: "application";
  operation: string;
  hasErrorId: false;
};

export type ToastShownEventProperties =
  | ToastErrorEventProperties
  | ToastSuccessEventProperties;

export type ToastInteractionEventProperties =
  | Omit<ToastErrorEventProperties, "hasErrorId" | "errorId">
  | Omit<ToastSuccessEventProperties, "hasErrorId">;
