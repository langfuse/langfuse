import { toast, type ExternalToast } from "sonner";
import { useRef, type ReactNode } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  getToastErrorProperties,
  type ToastErrorAnalytics,
  type ToastOperation,
  type ToastShownEventProperties,
} from "./toastAnalytics";

/** Native Sonner presentation with the same mandatory metadata contract as custom cards. */
export const showToast = (
  params: ToastMetadata & { title: ReactNode },
  options?: ExternalToast,
) => {
  const properties = getProperties(params);
  const content = (
    <ToastContent
      key={`${properties.toastType}:${properties.operation}`}
      properties={properties}
    >
      {params.title}
    </ToastContent>
  );
  const show = {
    ERROR: toast.error,
    WARNING: toast.warning,
    SUCCESS: toast.success,
    INFO: toast.info,
    LOADING: toast.loading,
    MESSAGE: toast.message,
    CUSTOM: toast.message,
  }[params.type];
  return show(content, options);
};

/** Custom rendering must declare metadata too; dismissal does not create a new shown event. */
export const showCustomToast = (
  render: (id: string | number) => ReactNode,
  metadata: ToastMetadata,
  options?: ExternalToast,
) =>
  toast.custom(
    (id) => (
      <ToastContent
        key={`${metadata.type}:${metadata.analytics.operation}`}
        properties={getProperties(metadata)}
      >
        {render(id)}
      </ToastContent>
    ),
    options,
  );

export const dismissToast = toast.dismiss;

/** Captures on mount and guards rerenders and StrictMode reattachments. */
const ToastContent = ({ children, properties }: ToastContentProps) => {
  const capture = usePostHogClientCapture();
  const captured = useRef(false);
  const captureShown = (element: HTMLSpanElement | null) => {
    if (!element || captured.current) return;
    captured.current = true;
    capture("toast:shown", properties);
  };

  return <span ref={captureShown}>{children}</span>;
};

function getProperties(metadata: ToastMetadata): ToastShownEventProperties {
  if (metadata.type === "ERROR" || metadata.type === "WARNING") {
    return getToastErrorProperties(metadata.analytics, metadata.type);
  }
  return {
    toastType: metadata.type,
    source: "application",
    operation: metadata.analytics.operation,
    hasErrorId: false,
  };
}

type ToastContentProps = {
  children: ReactNode;
  properties: ToastShownEventProperties;
};

type ToastMetadata =
  | { type: "ERROR" | "WARNING"; analytics: ToastErrorAnalytics }
  | {
      type: "SUCCESS" | "INFO" | "LOADING" | "MESSAGE" | "CUSTOM";
      analytics: { operation: ToastOperation };
    };
