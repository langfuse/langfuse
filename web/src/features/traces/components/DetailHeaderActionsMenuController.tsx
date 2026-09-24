import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { CheckIcon, CopyIcon, Webhook } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  buildEventsTablePathForObservationType,
  buildEventsTablePathForSpanName,
} from "@/src/features/events";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ObservationType } from "@langfuse/shared";
import { useWebCalloutAction } from "@/src/features/web-callouts";

type IdItem = {
  name: string;
  id: string;
};

type DetailHeaderActionsProps = {
  idItems: IdItem[];
  isAdmin: boolean;
  observationType?: ObservationType;
  projectId: string;
  observation?: {
    id: string;
    traceId: string;
    startTime: Date;
  };
  spanName?: string;
  webCalloutAction?: ReturnType<typeof useWebCalloutAction>;
};

type MenuPresentation =
  | {
      children: ComponentProps<typeof DropdownMenu>["children"];
      renderMenu?: never;
    }
  | {
      children?: never;
      renderMenu: (items: DropdownMenuItemDefinition[]) => ReactNode;
    };

type DetailHeaderActionsMenuControllerProps = DetailHeaderActionsProps &
  MenuPresentation;

type ConnectedDetailHeaderActionsMenuControllerProps = Omit<
  DetailHeaderActionsProps,
  "isAdmin" | "webCalloutAction"
> &
  MenuPresentation & {
    webCallout?: {
      traceId: string | null;
      observationId?: string | null;
      sessionId?: string | null;
    };
  };

function buildObservationClickHouseQuery(
  projectId: string,
  observation: NonNullable<
    DetailHeaderActionsMenuControllerProps["observation"]
  >,
) {
  const quote = (value: string) =>
    `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  const minute = observation.startTime
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

  // Match the events_full primary-key prefix, without requiring microsecond
  // precision from the browser's Date. The query runs in the admin's SQL client.
  return `SELECT *
FROM events_full
WHERE project_id = ${quote(projectId)}
  AND toStartOfMinute(start_time) >= toDateTime('${minute}:00', 'UTC')
  AND toStartOfMinute(start_time) < toDateTime('${minute}:00', 'UTC') + INTERVAL 1 MINUTE
  AND xxHash32(trace_id) = xxHash32(${quote(observation.traceId)})
  AND trace_id = ${quote(observation.traceId)}
  AND span_id = ${quote(observation.id)}
ORDER BY event_ts DESC
LIMIT 1;`;
}

export function ConnectedDetailHeaderActionsMenuController({
  webCallout,
  ...props
}: ConnectedDetailHeaderActionsMenuControllerProps) {
  const session = useSession();
  const isAdmin = session.data?.user?.admin === true;

  if (!webCallout) {
    return <DetailHeaderActionsMenuController {...props} isAdmin={isAdmin} />;
  }

  return (
    <WebCalloutActionController
      projectId={props.projectId}
      webCallout={webCallout}
    >
      {(webCalloutAction) => (
        <DetailHeaderActionsMenuController
          {...props}
          isAdmin={isAdmin}
          webCalloutAction={webCalloutAction}
        />
      )}
    </WebCalloutActionController>
  );
}

function WebCalloutActionController({
  projectId,
  webCallout,
  children,
}: {
  projectId: string;
  webCallout: NonNullable<
    ConnectedDetailHeaderActionsMenuControllerProps["webCallout"]
  >;
  children: (action: ReturnType<typeof useWebCalloutAction>) => ReactNode;
}) {
  const action = useWebCalloutAction(
    {
      projectId,
      traceId: webCallout.traceId,
      observationId: webCallout.observationId,
      sessionId: webCallout.sessionId,
    },
    true,
  );

  return children(action);
}

export function DetailHeaderActionsMenuController({
  idItems,
  isAdmin,
  observationType,
  projectId,
  observation,
  spanName,
  children,
  renderMenu,
  webCalloutAction,
}: DetailHeaderActionsMenuControllerProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const clickHouseQuery =
    isAdmin && observation
      ? buildObservationClickHouseQuery(projectId, observation)
      : null;

  const handleCopy = (textToCopy: string) => {
    copyTextToClipboard(textToCopy);
    setCopiedId(textToCopy);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const shouldShowFilterItem = Boolean(spanName?.trim());

  const href = shouldShowFilterItem
    ? buildEventsTablePathForSpanName({
        currentPath: router.asPath,
        projectId,
        spanName: spanName ?? "",
      })
    : null;

  const typeHref = observationType
    ? buildEventsTablePathForObservationType({
        currentPath: router.asPath,
        projectId,
        observationType,
      })
    : null;

  const filterTypeLabel = observationType ? `type:${observationType}` : null;

  const items: DropdownMenuItemDefinition[] = [
    ...(webCalloutAction
      ? [
          {
            type: "item" as const,
            id: "web-callout",
            title: `Call ${webCalloutAction.endpointName}`,
            icon: Webhook,
            disabled: webCalloutAction.isLoading
              ? { reason: "Web callout is running" }
              : undefined,
            onClick: () => {
              webCalloutAction.invokeCallout().catch(() => undefined);
            },
          },
          { id: "web-callout-separator", type: "separator" as const },
        ]
      : []),
    ...(href
      ? [
          {
            type: "item" as const,
            id: "filter-by-name",
            title: `Filter by name:${spanName}`,
            onClick: () => {
              router.push(href).catch(() => undefined);
            },
          },
        ]
      : []),
    ...(typeHref && filterTypeLabel
      ? [
          {
            type: "item" as const,
            id: "filter-by-type",
            title: `Filter by ${filterTypeLabel}`,
            onClick: () => {
              router.push(typeHref).catch(() => undefined);
            },
          },
        ]
      : []),
    ...(href || typeHref
      ? [{ id: "filter-separator", type: "separator" as const }]
      : []),
    ...idItems.map((item) => ({
      type: "item" as const,
      id: `copy-${item.name}`,
      title: `Copy ${item.name}`,
      icon: copiedId === item.id ? CheckIcon : CopyIcon,
      onClick: () => handleCopy(item.id),
    })),
    ...(clickHouseQuery
      ? [
          {
            type: "item" as const,
            id: "copy-clickhouse-query",
            title: "Copy ClickHouse query",
            icon: copiedId === clickHouseQuery ? CheckIcon : CopyIcon,
            onClick: () => handleCopy(clickHouseQuery),
          },
        ]
      : []),
  ];

  if (renderMenu) return renderMenu(items);

  return (
    <DropdownMenu items={items} placement="bottom-end">
      {children}
    </DropdownMenu>
  );
}
