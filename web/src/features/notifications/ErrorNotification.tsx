import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useSupportDrawer } from "@/src/features/support-chat";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { AlertTriangle, Check, Copy, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ErrorNotificationProps {
  error: string;
  description: string;
  type: "WARNING" | "ERROR";
  dismissToast: (t?: string | number | undefined) => void;
  toast: string | number;
  source?: "application" | "trpc";
  path?: string;
  traceId?: string;
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  description,
  type,
  dismissToast,
  toast,
  source = "application",
  path,
  traceId,
}) => {
  const { setOpen } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const capture = usePostHogClientCapture();
  const { copy, isCopied } = useCopyToClipboard();
  const didCaptureShown = useRef(false);
  const isError = type === "ERROR";
  const textColor = isError
    ? "text-destructive-foreground"
    : "text-dark-yellow";

  useEffect(() => {
    if (didCaptureShown.current) return;
    didCaptureShown.current = true;

    capture("toast:shown", {
      toastType: type,
      source,
      ...(path ? { path } : {}),
      hasErrorId: Boolean(traceId),
    });
  }, [capture, path, source, traceId, type]);

  return (
    <div className="flex justify-between">
      <div className="flex min-w-[300px] flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className={textColor} />
          <div className={`m-0 text-sm leading-tight font-bold ${textColor}`}>
            {error}
          </div>
        </div>
        {description && (
          <div
            className={`text-sm leading-tight whitespace-pre-line ${textColor}`}
          >
            {description}
          </div>
        )}
        {path && (
          <div className={`text-sm leading-tight ${textColor}`}>
            Path: {path}
          </div>
        )}
        {traceId && (
          <div
            className={`flex items-start gap-1 text-sm leading-tight ${textColor}`}
          >
            <span className="min-w-0 break-all">Error ID: {traceId}</span>
            <button
              className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 ${textColor}`}
              onClick={() => copy(traceId).catch(() => undefined)}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              aria-label="Copy error ID"
              title="Copy error ID"
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {isError && (
          <Button
            variant="errorNotification"
            size="sm"
            onClick={() => {
              capture("toast:report_issue", {
                toast_type: type,
                path,
              });
              setMigrationPanelOpen(false);
              setOpen(true, {
                message: formatReportIssueMessage({
                  error,
                  description,
                  path,
                  traceId,
                }),
              });
            }}
          >
            Report issue to Langfuse team
          </Button>
        )}
      </div>
      <button
        className={`flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 ${textColor} transition-colors duration-200`}
        onClick={() => {
          capture("toast:dismiss", {
            toast_type: type,
            path,
          });
          dismissToast(toast);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};

const formatReportIssueMessage = (details: {
  error: string;
  description: string;
  path?: string;
  traceId?: string;
}) => {
  const lines = [
    "I received the following error:",
    "",
    `Error: ${details.error}`,
  ];
  if (details.description) lines.push(`Description: ${details.description}`);
  if (details.path) lines.push(`Path: ${details.path}`);
  if (details.traceId) lines.push(`Error ID: ${details.traceId}`);
  return `${lines.join("\n")}\n\n`;
};
