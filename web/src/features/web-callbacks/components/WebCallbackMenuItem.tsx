import { useRouter } from "next/router";
import { Webhook } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import type { WebCallbackPayload } from "@/src/features/web-callbacks/types";
import { api } from "@/src/utils/api";

type WebCallbackTarget = {
  projectId: string;
  traceId: string | null;
  observationId?: string | null;
  sessionId?: string | null;
};

function useWebCallbackAction(props: WebCallbackTarget) {
  const router = useRouter();
  const routeSessionId =
    typeof router.query.sessionId === "string" ? router.query.sessionId : null;

  const hasProjectAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "project:read",
  });

  const endpoint = api.webCallbacks.enabled.useQuery(
    { projectId: props.projectId },
    {
      enabled: hasProjectAccess,
      staleTime: 60_000,
    },
  );

  const sendCallback = async () => {
    const callback = endpoint.data;

    if (!callback?.enabled) {
      return;
    }

    if (callback.hasSecretHeaders) {
      showErrorToast(
        "Callback failed",
        "Secret headers cannot be sent from the browser. Edit the endpoint and save headers as visible headers.",
      );
      return;
    }

    showSuccessToast({
      title: callback.toastMessage,
      description: callback.name,
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, callback.timeoutMs);

    try {
      const payload: WebCallbackPayload = {
        version: 1,
        items: [
          {
            projectId: props.projectId,
            traceId: props.traceId,
            observationId: props.observationId ?? null,
            sessionId: props.sessionId ?? routeSessionId ?? null,
          },
        ],
      };
      const response = await fetch(callback.url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          ...callback.requestHeaders,
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Callback endpoint returned HTTP ${response.status}.`);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Callback request timed out."
          : error instanceof Error
            ? `${error.message} Check that the endpoint allows browser requests from Langfuse.`
            : "Callback request failed.";

      showErrorToast("Callback failed", message);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {
    endpointName: endpoint.data?.name ?? "Web callback",
    isVisible: hasProjectAccess && endpoint.data?.enabled === true,
    sendCallback,
  };
}

export function WebCallbackMenuItem({
  projectId,
  traceId,
  observationId,
  sessionId,
  withSeparator,
}: WebCallbackTarget & {
  withSeparator?: boolean;
}) {
  const action = useWebCallbackAction({
    projectId,
    traceId,
    observationId,
    sessionId,
  });

  if (!action.isVisible) {
    return null;
  }

  return (
    <>
      <DropdownMenuItem
        className="text-xs"
        onSelect={() => {
          action.sendCallback();
        }}
      >
        <Webhook className="mr-2 h-4 w-4" />
        <span
          className="max-w-[260px] min-w-0 truncate"
          title={action.endpointName}
        >
          <span>Call </span>
          <span className="font-semibold">{action.endpointName}</span>
        </span>
      </DropdownMenuItem>
      {withSeparator && <DropdownMenuSeparator />}
    </>
  );
}

export function WebCallbackButton({
  projectId,
  traceId,
  observationId,
  sessionId,
}: WebCallbackTarget) {
  const action = useWebCallbackAction({
    projectId,
    traceId,
    observationId,
    sessionId,
  });

  if (!action.isVisible) {
    return null;
  }

  const label = `Call ${action.endpointName}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          title={label}
          variant="outline"
          size="icon"
          onClick={() => {
            action.sendCallback();
          }}
        >
          <Webhook className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
