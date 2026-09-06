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
import { useTranslations } from "next-intl";

type WebCalloutTarget = {
  projectId: string;
  traceId: string | null;
  observationId?: string | null;
  sessionId?: string | null;
};

function useWebCalloutAction(props: WebCalloutTarget) {
  const t = useTranslations("settingsEnterprise.webCalloutAction");
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
      showErrorToast(t("failed"), error.message);
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
    endpointName: endpoint.data?.name ?? t("fallbackName"),
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
  const t = useTranslations("settingsEnterprise.webCalloutAction");
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
          {t.rich("callRich", {
            endpointName: action.endpointName,
            strong: (chunks) => <span className="font-bold">{chunks}</span>,
          })}
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
  layout = "toolbar",
}: WebCalloutTarget & {
  /**
   * "toolbar" (default) is the inline icon button; "menu" renders the same
   * action as a full-width labeled row for the mobile header overflow popover.
   * (WebCalloutMenuItem is a Radix DropdownMenuItem and only works inside a
   * DropdownMenu, so the plain-popover mobile menu uses this row instead.)
   */
  layout?: "toolbar" | "menu";
}) {
  const t = useTranslations("settingsEnterprise.webCalloutAction");
  const action = useWebCalloutAction({
    projectId,
    traceId,
    observationId,
    sessionId,
  });

  if (!action.isVisible) {
    return null;
  }

  const label = t("call", { endpointName: action.endpointName });

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
