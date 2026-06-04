import { Webhook } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import type { WebCallbackPayload } from "@/src/features/web-callbacks/types";
import { api } from "@/src/utils/api";

export function WebCallbackMenuItem(props: {
  projectId: string;
  traceId: string;
  observationId?: string | null;
  withSeparator?: boolean;
}) {
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

  if (!hasProjectAccess || !endpoint.data?.enabled) {
    return null;
  }

  const endpointName = endpoint.data.name ?? "Web callback";

  return (
    <>
      <DropdownMenuItem
        className="text-xs"
        onSelect={() => {
          sendCallback();
        }}
      >
        <Webhook className="mr-2 h-4 w-4" />
        <span className="max-w-[260px] min-w-0 truncate" title={endpointName}>
          <span>Call </span>
          <span className="font-semibold">{endpointName}</span>
        </span>
      </DropdownMenuItem>
      {props.withSeparator && <DropdownMenuSeparator />}
    </>
  );
}
