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
import { api } from "@/src/utils/api";

type WebCalloutTarget = {
  projectId: string;
  traceId: string | null;
  observationId?: string | null;
  sessionId?: string | null;
};

function useWebCalloutAction(props: WebCalloutTarget) {
  const endpoint = api.webCallouts.enabled.useQuery(
    { projectId: props.projectId },
    {
      staleTime: 60_000,
    },
  );
  const invokeMutation = api.webCallouts.invoke.useMutation({
    onSuccess: () => {
      const callout = endpoint.data;
      if (!callout?.enabled) return;

      showSuccessToast({
        title: callout.toastMessage,
        description: callout.name,
      });
    },
    onError: (error) => {
      showErrorToast("Web callout failed", error.message);
    },
  });

  const invokeCallout = async () => {
    const callout = endpoint.data;

    if (!callout?.enabled) {
      return;
    }

    await invokeMutation.mutateAsync({
      projectId: props.projectId,
      traceId: props.traceId,
      observationId: props.observationId ?? null,
      sessionId: props.sessionId ?? null,
    });
  };

  return {
    endpointName: endpoint.data?.name ?? "Web callout",
    isLoading: invokeMutation.isPending,
    isVisible: endpoint.data?.enabled === true,
    invokeCallout,
  };
}

export function WebCalloutMenuItem({
  projectId,
  traceId,
  observationId,
  sessionId,
  withSeparator,
}: WebCalloutTarget & {
  withSeparator?: boolean;
}) {
  const action = useWebCalloutAction({
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
        disabled={action.isLoading}
        onSelect={(event) => {
          event.preventDefault();
          action.invokeCallout().catch(() => undefined);
        }}
      >
        <Webhook className="mr-2 h-4 w-4" />
        <span
          className="max-w-[260px] min-w-0 truncate"
          title={action.endpointName}
        >
          <span>Call </span>
          <span className="font-bold">{action.endpointName}</span>
        </span>
      </DropdownMenuItem>
      {withSeparator && <DropdownMenuSeparator />}
    </>
  );
}

export function WebCalloutButton({
  projectId,
  traceId,
  observationId,
  sessionId,
}: WebCalloutTarget) {
  const action = useWebCalloutAction({
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
          loading={action.isLoading}
          onClick={() => {
            action.invokeCallout().catch(() => undefined);
          }}
        >
          <Webhook className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
