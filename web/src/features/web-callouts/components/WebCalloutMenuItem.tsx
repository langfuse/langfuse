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
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

type WebCalloutTarget = {
  projectId: string;
  traceId: string | null;
  observationId?: string | null;
  sessionId?: string | null;
};

export function useWebCalloutAction(props: WebCalloutTarget, enabled: boolean) {
  const endpoint = api.webCallouts.enabled.useQuery(
    { projectId: props.projectId },
    {
      staleTime: 60_000,
      enabled,
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

  if (!enabled || endpoint.data?.enabled !== true) {
    return undefined;
  }

  return {
    endpointName: endpoint.data?.name ?? "Web callout",
    isLoading: invokeMutation.isPending,
    invokeCallout,
  };
}

type WebCalloutAction = NonNullable<ReturnType<typeof useWebCalloutAction>>;

export function WebCalloutMenuItem({
  action,
  withSeparator,
}: {
  action: WebCalloutAction;
  withSeparator?: boolean;
}) {
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
  action,
  layout = "toolbar",
}: {
  action: WebCalloutAction;
  /**
   * "toolbar" (default) is the inline icon button; "menu" renders the same
   * action as a full-width labeled row for the mobile header overflow popover.
   * (WebCalloutMenuItem is a Radix DropdownMenuItem and only works inside a
   * DropdownMenu, so the plain-popover mobile menu uses this row instead.)
   */
  layout?: "toolbar" | "menu";
}) {
  const label = `Call ${action.endpointName}`;

  if (layout === "menu") {
    return (
      <Button
        aria-label={label}
        variant="ghost"
        size="sm"
        loading={action.isLoading}
        className="w-full justify-start gap-2 font-normal"
        onClick={() => {
          action.invokeCallout().catch(() => undefined);
        }}
      >
        <Webhook className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate text-sm" title={label}>
          {label}
        </span>
      </Button>
    );
  }

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
